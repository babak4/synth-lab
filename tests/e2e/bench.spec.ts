import { test, expect } from '@playwright/test';

// Chromium only: this exercises the real-time AudioContext and the playoutStats API.
test.skip(({ browserName }) => browserName !== 'chromium', 'real-time audio benchmark runs on Chromium');

test('live benchmark page runs a short real-time session and reports results', async ({ page }) => {
  await page.goto('/bench.html');
  await page.locator('#tracks').fill('2');
  await page.locator('#voices').fill('4');
  await page.locator('#seconds').fill('2');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForFunction(() => (window as unknown as { __benchResult?: unknown }).__benchResult, undefined, { timeout: 30_000 });
  const r = await page.evaluate(() => (window as unknown as { __benchResult: Record<string, number | null> }).__benchResult);
  expect(r.tracks).toBe(2);
  expect(r.voicesPerTrack).toBe(4);
  // The audio clock must keep up with wall-clock time for a light load.
  expect(Math.abs(r.clockDriftMs!)).toBeLessThan(500);
  // underrun fields are either numbers (API present) or null (API absent); never undefined.
  expect(r).toHaveProperty('underrunEvents');
});
