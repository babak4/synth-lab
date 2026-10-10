import { test, expect, type Page } from '@playwright/test';
import { showTab } from './tabs';

type Synth = { patchStore: { getState(): { patch: { name: string; params: Record<string, number | string | boolean> } } } };
const param = (page: Page, id: string) =>
  page.evaluate((i) => (window as unknown as { __synth: Synth }).__synth.patchStore.getState().patch.params[i], id);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForSelector('[data-testid=synth-panel]');
  await showTab(page, 'Shape');
});

test('a whole knob drag is one undo step, and redo brings it back', async ({ page }) => {
  const knob = page.getByRole('slider', { name: 'Cutoff' });
  const b = (await knob.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 70, { steps: 20 });
  await page.mouse.up();
  const dragged = (await param(page, 'filter-cutoff')) as number;
  expect(dragged).toBeLessThan(8000);

  await page.keyboard.press('Control+z');
  expect(await param(page, 'filter-cutoff')).toBe(8000); // the entire drag undone by one press
  await page.keyboard.press('Control+Shift+z');
  expect(await param(page, 'filter-cutoff')).toBe(dragged);
});

test('typed values, preset loads and Try this are all undoable', async ({ page }) => {
  await page.getByRole('slider', { name: 'Resonance' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('9');
  await page.keyboard.press('Enter');
  expect(await param(page, 'filter-resonance')).toBe(9);

  await page.getByLabel('Preset', { exact: true }).selectOption('wobble-bass');
  expect(await param(page, 'lfo-sync')).toBe(true);

  await page.getByRole('button', { name: /^Undo: Load/ }).click();
  expect(await param(page, 'lfo-sync')).toBe(false);
  expect(await param(page, 'filter-resonance')).toBe(9); // the typed value is still there
  await page.getByRole('button', { name: /^Undo: Change Resonance/ }).click();
  expect(await param(page, 'filter-resonance')).toBe(1);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Help: Filter', exact: true }).click();
  await page.getByRole('button', { name: 'Set it up' }).first().click();
  expect(await param(page, 'filter-cutoff')).toBe(500);
  await page.getByRole('button', { name: /^Undo:/ }).click();
  expect(await param(page, 'filter-cutoff')).toBe(8000);
});

test('Ctrl+Z inside a text field is left to the field', async ({ page }) => {
  await page.getByRole('slider', { name: 'Cutoff' }).focus();
  await page.keyboard.press('Home');
  const before = await param(page, 'filter-cutoff');
  await page.getByLabel('Tempo in beats per minute').click();
  await page.keyboard.press('Control+z');
  expect(await param(page, 'filter-cutoff')).toBe(before);
});
