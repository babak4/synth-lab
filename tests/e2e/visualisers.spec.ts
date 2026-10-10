import { test, expect, type Page } from '@playwright/test';
import { showTab } from './tabs';

// Real-time audio analysis in the browser: Chromium only (Firefox/WebKit headless audio is not reliable for this).
test.skip(({ browserName }) => browserName !== 'chromium', 'visualiser checks need a running audio clock');

async function startWithNote(page: Page, pitch = 57) {
  await page.goto('/');
  await page.getByRole('button', { name: /start audio/i }).click();
  await expect(page.getByRole('button', { name: /audio on/i })).toBeVisible();
  await page.evaluate((p) => {
    const s = (window as unknown as { __synth: { engine: { noteOn(p: number, v: number): void }; bus: { emit(t: string, e: unknown): void }; host: { currentTime: number } } }).__synth;
    s.engine.noteOn(p, 100);
    s.bus.emit('note:on', { pitch: p, velocity: 100, source: 'keyboard', audioTime: s.host.currentTime });
  }, pitch);
  await page.waitForTimeout(600);
}

/** Pixels of a canvas as RGBA, read in the page. */
const pixels = (page: Page, viz: string) =>
  page.evaluate((v) => {
    const c = document.querySelector<HTMLCanvasElement>(`canvas[data-viz="${v}"]`)!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    return { w: c.width, h: c.height, data: Array.from(d.data) };
  }, viz);

test('a held saw appears stationary on the scope', async ({ page }) => {
  await startWithNote(page);
  const a = await pixels(page, 'scope');
  await page.waitForTimeout(137); // an arbitrary, non-period-aligned gap
  const b = await pixels(page, 'scope');
  expect(a.w).toBe(b.w);
  let diff = 0;
  let lit = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!) > 60) diff++;
    // accent-ish pixels (trace) differ from the flat background
    if (Math.abs(a.data[i]! - a.data[0]!) + Math.abs(a.data[i + 1]! - a.data[1]!) > 80) lit++;
  }
  const total = a.data.length / 4;
  expect(lit / total, 'something is drawn').toBeGreaterThan(0.01);
  expect(diff / total, 'trace did not move between frames').toBeLessThan(0.02);
});

test('the spectrum peaks at the played note (A3 = 220 Hz) on a log axis', async ({ page }) => {
  await startWithNote(page, 57);
  const { w, h, data } = await pixels(page, 'spectrum');
  // The trace is the accent colour at 85% over the background; gridlines are grey, so match the accent
  // specifically (a vertical gridline otherwise looks like a full-height "peak").
  const accent = await page.evaluate(() => {
    const el = document.createElement('div');
    el.style.color = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    document.body.appendChild(el);
    const m = getComputedStyle(el).color.match(/\d+/g)!.map(Number);
    el.remove();
    return m.slice(0, 3) as [number, number, number];
  });
  const bg = [data[0]!, data[1]!, data[2]!];
  const trace = accent.map((c, i) => 0.85 * c + 0.15 * bg[i]!);
  const isTrace = (i: number) => Math.abs(data[i]! - trace[0]!) + Math.abs(data[i + 1]! - trace[1]!) + Math.abs(data[i + 2]! - trace[2]!) < 40;

  const top = new Array<number>(w).fill(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (isTrace((y * w + x) * 4)) {
        top[x] = y;
        break;
      }
    }
  }
  expect(Math.min(...top), 'a trace is drawn').toBeLessThan(h - 10);
  const peakX = top.indexOf(Math.min(...top));
  const expectedX = (Math.log(220 / 20) / Math.log(20000 / 20)) * w;
  expect(Math.abs(peakX - expectedX) / w, `peak at ${peakX}px, expected ${expectedX.toFixed(0)}px`).toBeLessThan(0.04);
});

test('the meter moves with the signal and the visualisers stay inside the 4 ms frame budget', async ({ page }) => {
  await startWithNote(page);
  await page.evaluate(() => (window as unknown as { __synth: { vizStats(): unknown } }).__synth.vizStats()); // reset
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => (window as unknown as { __synth: { vizStats(): { frames: number; avgMs: number; maxMs: number } } }).__synth.vizStats());
  expect(stats.frames).toBeGreaterThan(20);
  expect(stats.avgMs, `avg draw cost ${stats.avgMs.toFixed(2)} ms`).toBeLessThan(4);

  const m = await pixels(page, 'meter');
  let bar = 0;
  for (let i = 0; i < m.data.length; i += 4) if (Math.abs(m.data[i]! - m.data[0]!) + Math.abs(m.data[i + 1]! - m.data[1]!) > 80) bar++;
  expect(bar).toBeGreaterThan(m.w * 2); // some bar and hold marker are drawn
  await expect(page.getByRole('button', { name: 'Clip indicator' })).toHaveAttribute('data-clipped', 'false');
});

test('every canvas shares one frame loop: exactly one subscription each, and hidden tabs draw nothing', async ({ page }) => {
  await startWithNote(page);
  // The pinned output strip (scope, spectrum, meter) is always there; each tab adds its own plots.
  const minimum = { Sound: 3, Shape: 6, Modulation: 4, Effects: 3, Composition: 3 } as const;
  for (const [tab, min] of Object.entries(minimum) as [keyof typeof minimum, number][]) {
    await showTab(page, tab);
    const { subscribers, canvases } = await page.evaluate(async () => {
      const path = '/src/ui/visualisers/raf-loop.ts';
      const mod = await import(/* @vite-ignore */ path);
      return {
        subscribers: (mod as { frameSubscriberCount(): number }).frameSubscriberCount(),
        canvases: document.querySelectorAll('canvas[data-viz]').length,
      };
    });
    expect(canvases, tab).toBeGreaterThanOrEqual(min);
    expect(subscribers, tab).toBe(canvases);
  }
});
