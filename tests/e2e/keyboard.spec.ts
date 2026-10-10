import { test, expect, type Page } from '@playwright/test';
import { showTab } from './tabs';

type Synth = {
  engine: { getVoiceStates(): { pitch: number; held: boolean }[] };
  appStore: { getState(): { kbdOctave: number; kbdVelocity: number; audio: string; keyboardLive: boolean } };
};

const synth = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { __synth: Synth }).__synth;
  return { voices: s.engine.getVoiceStates().map((v) => ({ pitch: v.pitch, held: v.held })), app: { ...s.appStore.getState() } };
});
const heldPitches = async (page: Page) => (await synth(page)).voices.filter((v) => v.held).map((v) => v.pitch).sort((a, b) => a - b);
const keyRect = (page: Page, pitch: number) => page.locator(`svg[data-testid="screen-keyboard"] rect[data-pitch="${pitch}"]`);

/**
 * Wait until nothing is scrolling: neither the page (scrollIntoView is asynchronous in WebKit) nor the
 * keyboard's own horizontal scroll (it glides when the octave changes). Measuring a key mid-scroll
 * would put the mouse over its neighbour.
 */
const scrollSettled = (page: Page) =>
  page.waitForFunction(() => {
    const el = document.querySelector('.kb-scroller') as (HTMLElement & { __pos?: string; __still?: number }) | null;
    if (!el) return false;
    const pos = `${el.scrollLeft},${window.scrollY},${window.scrollX}`;
    if (el.__pos === pos) el.__still = (el.__still ?? 0) + 1;
    else [el.__pos, el.__still] = [pos, 0];
    return (el.__still ?? 0) >= 5;
  }, undefined, { polling: 50 });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid=screen-keyboard]');
});

test('a laptop key plays its note, lights its on-screen key, shows its name, and release ends it', async ({ page }) => {
  await page.keyboard.down('KeyZ');
  await expect.poll(() => heldPitches(page)).toEqual([48]);
  await expect(keyRect(page, 48)).toHaveAttribute('data-down', 'true');
  await expect(page.getByTestId('note-readout')).toHaveText('C3');
  await page.keyboard.up('KeyZ');
  await expect.poll(() => heldPitches(page)).toEqual([]);
  await expect(keyRect(page, 48)).toHaveAttribute('data-down', 'false');
  await expect(page.getByTestId('note-readout')).toHaveText('C3'); // the last note stays visible
});

test('the first key press starts audio, with no click needed', async ({ page }) => {
  expect((await synth(page)).app.audio).toBe('off');
  await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await synth(page)).app.audio).toBe('on');
  await expect(page.getByRole('button', { name: /audio on/i })).toBeVisible();
});

test('plays chords from both manuals, and the overlapping notes are the same pitch', async ({ page }) => {
  for (const k of ['KeyZ', 'KeyC', 'KeyB', 'Digit2']) await page.keyboard.down(k);
  await expect.poll(() => heldPitches(page)).toEqual([48, 52, 55, 61]);
  await expect(page.getByTestId('note-readout')).toHaveText('C3 E3 G3 C#4');
  for (const k of ['KeyZ', 'KeyC', 'KeyB', 'Digit2']) await page.keyboard.up(k);
  await page.keyboard.down('Comma'); // C4 lower manual
  await page.keyboard.down('KeyQ'); // C4 upper manual
  await expect.poll(() => heldPitches(page)).toEqual([60]);
});

test('AZERTY and QWERTZ keyboards play the same pitches: it is the physical key that counts', async ({ page }) => {
  const fire = (type: string, code: string, key: string) =>
    page.evaluate(([t, c, k]) => window.dispatchEvent(new KeyboardEvent(t!, { code: c, key: k, bubbles: true, cancelable: true })), [type, code, key]);
  // The key in the QWERTY "Q" position types "a" on AZERTY; the "Z" position types "y" on QWERTZ.
  await fire('keydown', 'KeyQ', 'a');
  await fire('keydown', 'KeyZ', 'w'); // AZERTY puts "w" on the QWERTY "Z" position
  await expect.poll(() => heldPitches(page)).toEqual([48, 60]);
  await fire('keyup', 'KeyQ', 'a');
  await fire('keyup', 'KeyZ', 'w');
  await expect.poll(() => heldPitches(page)).toEqual([]);
});

test('arrow keys change octave and velocity; octave clamps; velocity steps by 16', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  let app = (await synth(page)).app;
  expect([app.kbdOctave, app.kbdVelocity]).toEqual([1, 112]);
  await page.keyboard.down('KeyZ');
  await expect.poll(() => heldPitches(page)).toEqual([60]);
  await page.keyboard.up('KeyZ');
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  app = (await synth(page)).app;
  expect(app.kbdOctave).toBe(2);
});

test('Esc stops all sound at once', async ({ page }) => {
  await page.keyboard.down('KeyZ');
  await page.keyboard.down('KeyE');
  await expect.poll(() => heldPitches(page)).toHaveLength(2);
  await page.keyboard.press('Escape');
  await expect.poll(() => heldPitches(page)).toEqual([]);
});

test('"?" never plays a note', async ({ page }) => {
  await page.keyboard.press('Shift+Slash'); // produces "?" on a US layout
  expect(await heldPitches(page)).toEqual([]);
  expect((await synth(page)).voices).toEqual([]);
});

test('typing in a text field does not play notes', async ({ page }) => {
  await page.getByLabel('Tempo in beats per minute').focus();
  await page.keyboard.type('zxcv');
  expect((await synth(page)).voices).toEqual([]);
  await expect(page.locator('.kb-live')).toHaveAttribute('data-live', 'false');
});

test('arrow keys on a focused knob adjust the knob, not the octave', async ({ page }) => {
  await showTab(page, 'Shape');
  const octave = (await synth(page)).app.kbdOctave;
  await page.getByRole('slider', { name: 'Cutoff' }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  expect((await synth(page)).app.kbdOctave).toBe(octave);
});

test('losing window focus mid-note leaves no stuck notes', async ({ page }) => {
  await page.keyboard.down('KeyZ');
  await page.keyboard.down('ShiftLeft');
  await expect.poll(() => heldPitches(page)).toEqual([48]);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(() => heldPitches(page)).toEqual([]);
  await page.keyboard.up('KeyZ');
  await page.keyboard.up('ShiftLeft');
});

test('an on-screen key plays on mouse down and stops on mouse up; dragging glides across keys', async ({ page }) => {
  const centre = async (pitch: number) => {
    const b = (await keyRect(page, pitch).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height - 6 };
  };
  await keyRect(page, 60).scrollIntoViewIfNeeded();
  await scrollSettled(page);
  const c4 = await centre(60);
  await page.mouse.move(c4.x, c4.y);
  await page.mouse.down();
  await expect.poll(() => heldPitches(page)).toEqual([60]);
  const d4 = await centre(62);
  await page.mouse.move(d4.x, d4.y, { steps: 6 });
  await expect.poll(() => heldPitches(page)).toEqual([62]); // C4 let go, D4 now sounding
  await page.mouse.up();
  await expect.poll(() => heldPitches(page)).toEqual([]);
});

test('the on-screen keyboard labels the laptop keys for the current octave', async ({ page }) => {
  await expect(page.locator('.key-label').first()).toBeVisible();
  const labelsAtZero = await page.locator('.key-label').allTextContents();
  expect(labelsAtZero.length).toBe(32);
  await page.keyboard.press('ArrowRight');
  const moved = await page.locator('.key-label').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
  expect(moved.length).toBe(32);
});
