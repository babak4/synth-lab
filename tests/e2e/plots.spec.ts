import { test, expect, type Page } from '@playwright/test';

test.skip(({ browserName }) => browserName !== 'chromium', 'plot checks need a running audio clock');

type Synth = {
  engine: { noteOn(p: number, v: number): void; noteOff(p: number): void };
  patchStore: { getState(): { setParam(id: string, v: unknown): void } };
};

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /start audio/i }).click();
  await expect(page.getByRole('button', { name: /audio on/i })).toBeVisible();
}

const setParam = (page: Page, id: string, v: unknown) =>
  page.evaluate(([i, val]) => (window as unknown as { __synth: Synth }).__synth.patchStore.getState().setParam(i as string, val), [id, v] as const);

const frames = (page: Page, n = 2) =>
  page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
  }, n);

/** Hash of a canvas' pixels. */
const hash = (page: Page, viz: string) =>
  page.evaluate((v) => {
    const c = document.querySelector<HTMLCanvasElement>(`canvas[data-viz="${v}"]`)!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) h = Math.imul(h ^ (d[i]! + d[i + 1]! * 3 + d[i + 2]! * 7), 16777619);
    return h >>> 0;
  }, viz);

/** Centroid of the dots (accent-coloured pixels) on a plot, or null if there are none. */
const dots = (page: Page, viz: string) =>
  page.evaluate((v) => {
    const c = document.querySelector<HTMLCanvasElement>(`canvas[data-viz="${v}"]`)!;
    const probe = document.createElement('div');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    document.body.appendChild(probe);
    const [r, g, b] = getComputedStyle(probe).color.match(/\d+/g)!.map(Number) as [number, number, number];
    probe.remove();
    const { width: w, height: h } = c;
    const d = c.getContext('2d')!.getImageData(0, 0, w, h).data;
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (Math.abs(d[i]! - r) + Math.abs(d[i + 1]! - g) + Math.abs(d[i + 2]! - b) < 12) {
          n++;
          sx += x;
          sy += y;
        }
      }
    return n < 6 ? null : { x: sx / n / w, y: sy / n / h, n };
  }, viz);

test('the filter curve redraws within a frame or two of a control change', async ({ page }) => {
  await start(page);
  await frames(page, 3);
  const before = await hash(page, 'filter-plot');
  await setParam(page, 'filter-cutoff', 800);
  await frames(page, 2);
  const after = await hash(page, 'filter-plot');
  expect(after).not.toBe(before);
  await setParam(page, 'filter-type', 'highpass');
  await frames(page, 2);
  expect(await hash(page, 'filter-plot')).not.toBe(after);
});

test('envelope dots appear for a held note, advance through the release, and vanish when it ends', async ({ page }) => {
  await start(page);
  await setParam(page, 'amp-env-release', 1);
  await setParam(page, 'amp-env-sustain', 0.5);
  await frames(page, 3);
  expect(await dots(page, 'amp-env-plot'), 'no note yet, no dot').toBeNull();

  await page.evaluate(() => (window as unknown as { __synth: Synth }).__synth.engine.noteOn(60, 100));
  await page.waitForTimeout(700);
  const held = await dots(page, 'amp-env-plot');
  expect(held, 'held note shows a dot').not.toBeNull();
  expect(held!.y).toBeLessThan(0.7); // up on the plot, at the sustain level rather than on the baseline

  await page.evaluate(() => (window as unknown as { __synth: Synth }).__synth.engine.noteOff(60));
  await page.waitForTimeout(250);
  const early = await dots(page, 'amp-env-plot');
  await page.waitForTimeout(450);
  const late = await dots(page, 'amp-env-plot');
  expect(early).not.toBeNull();
  expect(late).not.toBeNull();
  expect(late!.x, 'dot moves right through the release').toBeGreaterThan(early!.x);
  expect(late!.y, 'and falls toward the baseline').toBeGreaterThan(early!.y);

  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as unknown as { __synth: { engine: { tick?(t: number): void }; host: { currentTime: number } } }).__synth.engine.tick?.(1e9));
  await frames(page, 3);
  expect(await dots(page, 'amp-env-plot'), 'voice gone, dot gone').toBeNull();
});

test('the LFO marker travels along the cycle', async ({ page }) => {
  await start(page);
  await setParam(page, 'lfo-rate', 1);
  await frames(page, 2);
  const a = await dots(page, 'lfo-plot');
  await page.waitForTimeout(300);
  const b = await dots(page, 'lfo-plot');
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(Math.abs(a!.x - b!.x)).toBeGreaterThan(0.05);
});
