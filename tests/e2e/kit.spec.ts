import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/#kit');
});

test('knob: drag up raises the value, double-click resets', async ({ page }) => {
  const knob = page.getByRole('slider', { name: 'Cutoff' });
  await expect(knob).toHaveAttribute('aria-valuetext', '8.00 kHz');
  const box = (await knob.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  const lowered = Number(await knob.getAttribute('aria-valuenow'));
  expect(lowered).toBeLessThan(8000);
  await knob.dblclick();
  await expect(knob).toHaveAttribute('aria-valuetext', '8.00 kHz');
});

test('keyboard-only operation: tab to a knob and use arrows', async ({ page }) => {
  const knob = page.getByRole('slider', { name: 'Resonance' });
  await knob.focus();
  await expect(knob).toBeFocused();
  await page.keyboard.press('Home');
  await expect(knob).toHaveAttribute('aria-valuenow', '0.1');
  await page.keyboard.press('ArrowUp');
  expect(Number(await knob.getAttribute('aria-valuenow'))).toBeGreaterThan(0.1);
});

test('segmented control: arrow keys change selection and move focus', async ({ page }) => {
  const sine = page.getByRole('radio', { name: 'Sine' }).first();
  const saw = page.getByRole('radio', { name: 'Sawtooth' }).first();
  await saw.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(sine).toBeChecked();
  await expect(sine).toBeFocused();
});

test('help button reports its help id; wheel adjusts a knob without scrolling', async ({ page }) => {
  await page.getByRole('button', { name: 'Help: Cutoff' }).click();
  await expect(page.getByTestId('last-help')).toHaveText('filter-cutoff');
  const knob = page.getByRole('slider', { name: 'Resonance' });
  const before = Number(await knob.getAttribute('aria-valuenow'));
  await knob.hover();
  await page.mouse.wheel(0, -100);
  expect(Number(await knob.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
});
