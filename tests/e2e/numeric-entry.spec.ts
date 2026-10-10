import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { showTab } from './tabs';

type Synth = {
  engine: { getPatch(): { params: Record<string, number | string | boolean> }; getVoiceStates(): unknown[] };
  patchStore: { getState(): { patch: { params: Record<string, number | string | boolean> } } };
  appStore: { getState(): { masterVolumeDb: number; kbdOctave: number } };
};
const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __synth: Synth }).__synth;
    return {
      cutoff: s.patchStore.getState().patch.params['filter-cutoff'] as number,
      engineCutoff: s.engine.getPatch().params['filter-cutoff'] as number,
      attack: s.patchStore.getState().patch.params['amp-env-attack'] as number,
      mixA: s.patchStore.getState().patch.params['mix-osc-a'] as number,
      master: s.appStore.getState().masterVolumeDb,
      voices: s.engine.getVoiceStates().length,
      octave: s.appStore.getState().kbdOctave,
    };
  });

const edit = async (page: Page, label: string, text: string) => {
  await page.getByRole('button', { name: new RegExp(`^Edit ${label} value`) }).click();
  const box = page.getByRole('textbox', { name: `${label} value` });
  await expect(box).toBeFocused();
  await box.fill(text);
  return box;
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForSelector('[data-testid=synth-panel]');
  await showTab(page, 'Shape');
});

test('typing 2.5k into Cutoff moves the knob, the patch and the engine', async ({ page }) => {
  const box = await edit(page, 'Filter cutoff'.replace('Filter cutoff', 'Cutoff'), '2.5k');
  await box.press('Enter');
  const s = await state(page);
  expect(s.cutoff).toBeCloseTo(2500, 3);
  expect(s.engineCutoff).toBeCloseTo(2500, 3);
  const knob = page.getByRole('slider', { name: 'Cutoff' });
  await expect(knob).toHaveAttribute('aria-valuetext', '2.50 kHz');
  await expect(page.getByRole('button', { name: /^Edit Cutoff value. Currently 2.50 kHz/ })).toBeFocused();
});

test('units work: times in ms, percentages, decibels in the top bar', async ({ page }) => {
  await (await edit(page, 'Amp attack', '300 ms')).press('Enter');
  expect((await state(page)).attack).toBeCloseTo(0.3, 6);
  await showTab(page, 'Sound');
  await (await edit(page, 'Oscillator A level', '35')).press('Enter');
  expect((await state(page)).mixA).toBeCloseTo(0.35, 6);
  await (await edit(page, 'Master volume', '-6')).press('Enter');
  expect((await state(page)).master).toBe(-6);
});

test('Escape cancels; an unreadable value shows a message and changes nothing; out of range is clamped', async ({ page }) => {
  const before = (await state(page)).cutoff;
  const box = await edit(page, 'Cutoff', '123');
  await box.press('Escape');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect((await state(page)).cutoff).toBe(before);

  const box2 = await edit(page, 'Cutoff', 'loud');
  await box2.press('Enter');
  await expect(page.getByRole('alert')).toContainText(/frequency/);
  expect((await state(page)).cutoff).toBe(before);

  await box2.fill('999k');
  await box2.press('Enter');
  expect((await state(page)).cutoff).toBe(20000);
});

test('typing in the field plays no note and opens no help', async ({ page }) => {
  const box = await edit(page, 'Cutoff', '');
  await box.pressSequentially('zxcvqwerty?asdf', { delay: 5 });
  expect((await state(page)).voices).toBe(0);
  await expect(page.getByTestId('help-drawer')).toBeHidden();
  await expect(box).toHaveValue('zxcvqwerty?asdf');
  await box.press('Escape');
  // arrow keys inside the field move the caret, not the octave
  const box2 = await edit(page, 'Cutoff', '440');
  await box2.press('ArrowLeft');
  await box2.press('ArrowUp');
  expect((await state(page)).octave).toBe(0);
});

test('keyboard only: focus a knob, Enter to edit, type, Enter to commit, focus lands on the number', async ({ page }) => {
  await page.getByRole('slider', { name: 'Resonance' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Resonance value' })).toBeFocused();
  await page.keyboard.type('8');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('slider', { name: 'Resonance' })).toHaveAttribute('aria-valuenow', '8');
  await expect(page.getByRole('button', { name: /^Edit Resonance value/ })).toBeFocused();
});

test('accessibility: no serious or critical axe violations with an editor open and an error showing', async ({ page }) => {
  const box = await edit(page, 'Cutoff', 'loud');
  await box.press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.help} (e.g. ${v.nodes[0]?.target.join(' ')})`)).toEqual([]);
});
