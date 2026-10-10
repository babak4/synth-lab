import { test, expect } from '@playwright/test';

test('blank page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Synth Lab' })).toBeVisible();
});
