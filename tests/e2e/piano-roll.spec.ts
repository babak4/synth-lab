import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { showTab } from './tabs';

type Note = { id: string; pitch: number; start: number; duration: number; velocity: number };
type Track = { id: string; colour: string; notes: Note[] };
type Project = { lengthBars: number; loop: { enabled: boolean; startBar: number; endBar: number }; tracks: Track[] };
type View = {
  viewport: { scrollTick: number; scrollY: number; pxPerTick: number; rowHeight: number };
  size: { width: number; height: number };
  contentTicks: number;
  ghostNotes: boolean;
};
type Frame = { notes: number; ghostNotes: number; gridLines: number; playheadX: number | null; loop: { x0: number; x1: number; enabled: boolean }; draws: number };
type Synth = {
  projectStore: {
    getState(): { project: Project; selectedTrackId: string; addTrack(): void; selectTrack(id: string): void; loadProject(p: Project): void; setLoop(l: Partial<Project['loop']>): void };
  };
  notesStore: { getState(): { held: ReadonlyMap<number, number> } };
  bus: { on(t: string, fn: (e: unknown) => void): () => void };
  pianoRoll: { view: { getState(): View & { setGhostNotes(on: boolean): void } }; frame(): Frame };
};

const run = <T>(page: Page, fn: (s: Synth) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__synth)`) as Promise<T>;
const view = (page: Page) => run(page, (s) => ({ ...s.pianoRoll.view.getState() }) as View);
const frame = (page: Page) => run(page, (s) => s.pianoRoll.frame());

const KEY_WIDTH = 56;
const RULER_HEIGHT = 24;

function note(id: string, pitch: number, start: number, duration: number, velocity = 100): Note {
  return { id, pitch, start, duration, velocity };
}

/** Open the Composition tab on a project with one track of notes around middle C and a second quieter one. */
async function open(page: Page, opts: { second?: boolean } = {}) {
  await page.goto('/');
  await page.waitForSelector('[role=tabpanel]');
  await run(page, (s) => {
    const st = s.projectStore.getState();
    if (st.project.tracks.length < 2) st.addTrack();
  });
  await run(page, (s) => {
    const st = s.projectStore.getState();
    const p = structuredClone(st.project);
    p.tracks[0]!.notes = [
      { id: 'a', pitch: 60, start: 0, duration: 960, velocity: 100 },
      { id: 'b', pitch: 64, start: 960, duration: 960, velocity: 40 },
      { id: 'c', pitch: 67, start: 1920, duration: 1920, velocity: 127 },
      { id: 'far', pitch: 72, start: 7 * 3840, duration: 480, velocity: 90 },
    ];
    p.tracks[1]!.notes = [{ id: 'g1', pitch: 55, start: 0, duration: 3840, velocity: 80 }, { id: 'g2', pitch: 52, start: 3840, duration: 3840, velocity: 80 }];
    st.loadProject(p);
  });
  void opts;
  await showTab(page, 'Composition');
  await expect(page.getByRole('region', { name: 'Piano roll' })).toBeVisible();
  await expect.poll(async () => (await frame(page)).draws).toBeGreaterThan(0);
}

const stage = (page: Page) => page.getByRole('group', { name: /^Piano roll grid/ });

test('the Composition tab shows a labelled piano roll with its view controls', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('region', { name: 'Piano roll' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Piano roll view' })).toBeVisible();
  await expect(stage(page)).toHaveAccessibleName('Piano roll grid for Track 1, 4 notes');
  for (const name of ['Zoom time in', 'Zoom time out', 'Zoom pitch in', 'Zoom pitch out', 'Fit to notes']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Ghost notes' })).toHaveAttribute('aria-pressed', 'true');
});

test('it opens on the start of the song with middle C in view, and reports the grid size', async ({ page }) => {
  await open(page);
  const v = await view(page);
  expect(v.viewport.scrollTick).toBe(0);
  expect(v.size.width).toBeGreaterThan(300);
  expect(v.size.height).toBeGreaterThan(100);
  expect(v.contentTicks).toBe(8 * 3840);
  // Middle C's row is on screen.
  const rowTop = (127 - 60) * v.viewport.rowHeight - v.viewport.scrollY;
  expect(rowTop).toBeGreaterThanOrEqual(0);
  expect(rowTop).toBeLessThan(v.size.height);
});

test('it draws only the selected track\'s notes solid and the others as ghosts', async ({ page }) => {
  await open(page);
  // Default zoom: 0.1 px/tick, so ~8000 ticks are visible: notes a, b, c; 'far' (bar 8) is off screen.
  await expect.poll(async () => (await frame(page)).notes).toBe(3);
  expect((await frame(page)).ghostNotes).toBe(2);
  expect((await frame(page)).gridLines).toBeGreaterThan(20);

  await page.getByRole('button', { name: 'Ghost notes' }).click();
  await expect(page.getByRole('button', { name: 'Ghost notes' })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await frame(page)).ghostNotes).toBe(0);

  // Select the second track: its two notes are solid; the first track's become ghosts again if turned on.
  await run(page, (s) => s.pianoRoll.view.getState().setGhostNotes(true));
  await run(page, (s) => s.projectStore.getState().selectTrack(s.projectStore.getState().project.tracks[1]!.id));
  await expect(stage(page)).toHaveAccessibleName('Piano roll grid for Track 2, 2 notes');
  await expect.poll(async () => (await frame(page)).notes).toBe(2);
  await expect.poll(async () => (await frame(page)).ghostNotes).toBe(3);
});

test('canvas smoke check: a note is painted in its track colour, the empty grid is not', async ({ page }) => {
  await open(page);
  const geometry = await page.evaluate(`(() => {
    const s = window.__synth;
    const vp = s.pianoRoll.view.getState().viewport;
    const track = s.projectStore.getState().project.tracks[0];
    const n = track.notes.find((x) => x.id === 'c');
    const canvas = document.querySelector('canvas[data-viz=piano-roll]');
    const dpr = canvas.width / canvas.clientWidth;
    const px = (x, y) => Array.from(canvas.getContext('2d').getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data);
    const inside = px(${KEY_WIDTH} + (n.start + n.duration / 2 - vp.scrollTick) * vp.pxPerTick, ${RULER_HEIGHT} + (127 - n.pitch) * vp.rowHeight - vp.scrollY + vp.rowHeight / 2);
    const empty = px(${KEY_WIDTH} + (n.start + n.duration / 2 - vp.scrollTick) * vp.pxPerTick, ${RULER_HEIGHT} + (127 - n.pitch - 5) * vp.rowHeight - vp.scrollY + vp.rowHeight / 2);
    return { inside, empty, colour: track.colour };
  })()`);
  const { inside, empty, colour } = geometry as { inside: number[]; empty: number[]; colour: string };
  const want = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16)); // velocity 127 → fully opaque
  want.forEach((c, i) => expect(Math.abs(inside[i]! - c), `${inside} vs ${colour}`).toBeLessThan(12));
  expect(inside).not.toEqual(empty);
});

test('loop region follows the project loop', async ({ page }) => {
  await open(page);
  let f = await frame(page);
  expect(f.loop.enabled).toBe(true);
  const v = await view(page);
  expect(f.loop.x0).toBeCloseTo(0, 6);
  expect(f.loop.x1).toBeCloseTo(8 * 3840 * v.viewport.pxPerTick, 6);

  await run(page, (s) => s.projectStore.getState().setLoop({ startBar: 1, endBar: 3 }));
  await expect.poll(async () => (await frame(page)).loop.x0).toBeCloseTo(3840 * v.viewport.pxPerTick, 6);
  f = await frame(page);
  expect(f.loop.x1).toBeCloseTo(3 * 3840 * v.viewport.pxPerTick, 6);

  await run(page, (s) => s.projectStore.getState().setLoop({ enabled: false }));
  await expect.poll(async () => (await frame(page)).loop.enabled).toBe(false);
});

test('the wheel scrolls, Shift+wheel scrolls sideways, Ctrl+wheel zooms time at the pointer, Alt+wheel zooms pitch', async ({ page }) => {
  await open(page);
  const box = (await stage(page).boundingBox())!;
  const gx = box.x + KEY_WIDTH + 200;
  const gy = box.y + RULER_HEIGHT + 100;
  await page.mouse.move(gx, gy);

  const y0 = (await view(page)).viewport.scrollY;
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await view(page)).viewport.scrollY).toBeGreaterThan(y0);

  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 300);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await view(page)).viewport.scrollTick).toBeGreaterThan(0);

  // Reset to the start so the tick under the pointer is easy to reason about.
  await page.getByRole('button', { name: 'Fit to notes' }).click();
  await page.mouse.move(gx, gy); // the click moved the pointer onto the toolbar
  const before = await view(page);
  const tickUnder = before.viewport.scrollTick + 200 / before.viewport.pxPerTick;
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await view(page)).viewport.pxPerTick).toBeGreaterThan(before.viewport.pxPerTick);
  const after = await view(page);
  expect(after.viewport.scrollTick + 200 / after.viewport.pxPerTick).toBeCloseTo(tickUnder, 0);
  expect(after.viewport.rowHeight).toBe(before.viewport.rowHeight);

  await page.keyboard.down('Alt');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await view(page)).viewport.rowHeight).toBeGreaterThan(before.viewport.rowHeight);
  // The page itself never scrolled or zoomed.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('keyboard: arrows scroll, plus and minus zoom time, brackets zoom pitch, F fits; none of it plays a note', async ({ page }) => {
  await open(page);
  await stage(page).focus();
  const v0 = await view(page);

  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await view(page)).viewport.scrollTick).toBeCloseTo(48 / v0.viewport.pxPerTick, 6);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await view(page)).viewport.scrollTick).toBe(0);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await view(page)).viewport.scrollY).toBeCloseTo(v0.viewport.scrollY + 48, 6);
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await view(page)).viewport.scrollY).toBeCloseTo(v0.viewport.scrollY, 6);
  await page.keyboard.press('PageDown');
  await expect.poll(async () => (await view(page)).viewport.scrollY).toBeGreaterThan(v0.viewport.scrollY + 100);
  await page.keyboard.press('PageUp');

  await page.keyboard.press('+');
  await expect.poll(async () => (await view(page)).viewport.pxPerTick).toBeCloseTo(v0.viewport.pxPerTick * 1.25, 9);
  await page.keyboard.press('-');
  await expect.poll(async () => (await view(page)).viewport.pxPerTick).toBeCloseTo(v0.viewport.pxPerTick, 9);
  await page.keyboard.press(']');
  await expect.poll(async () => (await view(page)).viewport.rowHeight).toBeCloseTo(v0.viewport.rowHeight * 1.25, 9);
  await page.keyboard.press('[');
  await expect.poll(async () => (await view(page)).viewport.rowHeight).toBeCloseTo(v0.viewport.rowHeight, 9);

  await page.keyboard.press('f');
  await expect.poll(async () => (await view(page)).viewport.pxPerTick).toBeGreaterThan(0);
  // Fit puts all four notes (bar 1 … bar 8) on screen.
  await expect.poll(async () => (await frame(page)).notes).toBe(4);

  // No laptop-keyboard note was triggered and the octave did not change.
  expect(await run(page, (s) => s.notesStore.getState().held.size)).toBe(0);
});

test('toolbar buttons zoom and fit', async ({ page }) => {
  await open(page);
  const v0 = await view(page);
  await page.getByRole('button', { name: 'Zoom time in' }).click();
  await expect.poll(async () => (await view(page)).viewport.pxPerTick).toBeCloseTo(v0.viewport.pxPerTick * 1.25, 9);
  await page.getByRole('button', { name: 'Zoom time out' }).click();
  await expect.poll(async () => (await view(page)).viewport.pxPerTick).toBeCloseTo(v0.viewport.pxPerTick, 9);
  await page.getByRole('button', { name: 'Zoom pitch in' }).click();
  await expect.poll(async () => (await view(page)).viewport.rowHeight).toBeCloseTo(v0.viewport.rowHeight * 1.25, 9);
  await page.getByRole('button', { name: 'Zoom pitch out' }).click();
  await expect.poll(async () => (await view(page)).viewport.rowHeight).toBeCloseTo(v0.viewport.rowHeight, 9);
  await page.getByRole('button', { name: 'Fit to notes' }).click();
  await expect.poll(async () => (await frame(page)).notes).toBe(4);
});

test('zoom and scroll stay inside their limits', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 30; i++) await page.getByRole('button', { name: 'Zoom time in' }).click();
  expect((await view(page)).viewport.pxPerTick).toBe(0.5);
  for (let i = 0; i < 60; i++) await page.getByRole('button', { name: 'Zoom time out' }).click();
  const v = await view(page);
  expect(v.viewport.pxPerTick).toBeCloseTo(v.size.width / v.contentTicks, 9); // whole song fits
  expect(v.viewport.scrollTick).toBe(0);
  await stage(page).focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('PageUp');
  await expect.poll(async () => (await view(page)).viewport.scrollY).toBe(0); // the top of the keyboard, not beyond
  for (let i = 0; i < 40; i++) await page.keyboard.press('PageDown');
  const end = await view(page);
  expect(end.viewport.scrollY).toBeCloseTo(128 * end.viewport.rowHeight - end.size.height, 6);
});

test('view state survives switching tabs', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Zoom time in' }).click();
  const v = await view(page);
  await showTab(page, 'Shape');
  await showTab(page, 'Composition');
  await expect.poll(async () => (await frame(page)).draws).toBeGreaterThan(0);
  expect((await view(page)).viewport.pxPerTick).toBe(v.viewport.pxPerTick);
});

test('pressing a piano key auditions that pitch through the bus, releasing stops it', async ({ page }) => {
  await open(page);
  await run(page, (s) => {
    const w = window as unknown as { __events: unknown[] };
    w.__events = [];
    s.bus.on('note:on', (e) => w.__events.push(['on', e]));
    s.bus.on('note:off', (e) => w.__events.push(['off', e]));
    return 0;
  });
  const box = (await stage(page).boundingBox())!;
  const v = await view(page);
  const pitch = 60;
  const y = box.y + RULER_HEIGHT + (127 - pitch) * v.viewport.rowHeight - v.viewport.scrollY + v.viewport.rowHeight / 2;
  await page.mouse.move(box.x + 20, y);
  await page.mouse.down();
  await page.mouse.up();
  const events = (await page.evaluate(() => (window as unknown as { __events: [string, { pitch: number; source: string }][] }).__events)).filter(([, e]) => e.source === 'audition');
  expect(events.map(([k, e]) => [k, e.pitch])).toEqual([['on', 60], ['off', 60]]);
});

test('it fits the fixed viewport: nothing scrolls but the roll itself, at small and large window sizes', async ({ page }) => {
  for (const size of [{ width: 1280, height: 720 }, { width: 1280, height: 800 }, { width: 1024, height: 600 }]) {
    await page.setViewportSize(size);
    await open(page);
    const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight, sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(m.sh, `${size.width}x${size.height} page height`).toBe(m.ih);
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    const body = await page.locator('.app-content').evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    // The roll has a minimum height; in a very short window the tab body scrolls (inside itself), never the page.
    if (size.height >= 720) expect(body.sh, `${size.width}x${size.height} tab body overflows`).toBeLessThanOrEqual(body.ch + 1);
    const st = (await stage(page).boundingBox())!;
    expect(st.height).toBeGreaterThan(100);
    expect(st.x).toBeGreaterThanOrEqual(0);
    expect(st.x + st.width).toBeLessThanOrEqual(size.width);
    if (size.height >= 720) {
      const kb = (await page.locator('[data-zone=keyboard]').boundingBox())!;
      expect(st.y + st.height).toBeLessThanOrEqual(kb.y + 0.5); // the roll ends above the pinned keyboard
    }
  }
});

test('reduced motion: still renders and responds', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.getByRole('button', { name: 'Zoom time in' }).click();
  await expect.poll(async () => (await frame(page)).notes).toBeGreaterThan(0);
});

test('accessibility: no serious or critical axe violations on the piano roll', async ({ page }) => {
  await open(page);
  const results = await new AxeBuilder({ page }).include('[role=tabpanel]').analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});
