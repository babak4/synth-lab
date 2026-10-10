import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TABS = ['Sound', 'Shape', 'Modulation', 'Effects', 'Composition'] as const;
const SIZES = [
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
];

type Synth = {
  patchStore: { getState(): { patch: { params: Record<string, unknown> } } };
  notesStore: { getState(): { held: ReadonlyMap<number, number> } };
  helpStore: { getState(): { open(id: string): void; close(): void } };
  engine: { noteOn(p: number, v: number): void };
  bus: { emit(t: string, e: unknown): void };
  host: { currentTime: number };
};

const openTab = (page: Page, name: string) => page.getByRole('tab', { name }).click();
const patchJson = (page: Page) =>
  page.evaluate(() => JSON.stringify((window as unknown as { __synth: Synth }).__synth.patchStore.getState().patch));
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;

async function scrollMetrics(page: Page) {
  return page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

async function expectPinnedInView(page: Page) {
  const vh = page.viewportSize()!.height;
  for (const sel of ['[data-zone=keyboard]', 'canvas[data-viz=scope]', 'canvas[data-viz=spectrum]', '[role=tablist]']) {
    const b = await box(page, sel);
    expect(b.y, `${sel} top`).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height, `${sel} bottom`).toBeLessThanOrEqual(vh + 0.5);
  }
}

for (const size of SIZES) {
  for (const drawer of [false, true]) {
    test(`nothing scrolls and the keyboard and output stay in view, ${size.width}×${size.height}${drawer ? ' with help open' : ''}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await page.waitForSelector('[data-testid=synth-panel], [role=tabpanel]');
      if (drawer) {
        await page.getByRole('button', { name: 'Help', exact: true }).click();
        await expect(page.getByTestId('help-drawer')).toBeVisible();
      }
      for (const name of TABS) {
        await openTab(page, name);
        const m = await scrollMetrics(page);
        expect(m.scrollHeight, `${name}: page height`).toBe(m.innerHeight);
        expect(m.scrollWidth, `${name}: page width`).toBeLessThanOrEqual(m.innerWidth);
        await expectPinnedInView(page);
        // With the drawer closed the tab's own content fits; with it open the body narrows and may scroll by itself.
        if (drawer) continue;
        const sc = await page.locator('.app-content').evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
        expect(sc.sh, `${name}: tab body overflows`).toBeLessThanOrEqual(sc.ch + 1);
      }
    });
  }
}

test('a tab taller than the space scrolls inside its body only', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.goto('/');
  await openTab(page, 'Shape');
  const before = { kb: await box(page, '[data-zone=keyboard]'), tabs: await box(page, '[role=tablist]') };
  const body = page.locator('.app-content');
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const m = await scrollMetrics(page);
  expect(m.scrollHeight).toBe(m.innerHeight);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await box(page, '[data-zone=keyboard]')).toEqual(before.kb);
  expect(await box(page, '[role=tablist]')).toEqual(before.tabs);
});

test('tab keyboard behaviour: arrows, Home, End, and a single tab stop', async ({ page }) => {
  await page.goto('/');
  const tab = (n: string) => page.getByRole('tab', { name: n });
  await expect(tab('Sound')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Sound')).toHaveAttribute('tabindex', '0');
  await expect(tab('Shape')).toHaveAttribute('tabindex', '-1');
  const octave = await page.evaluate(() => (window as unknown as { __synth: { appStore: { getState(): { kbdOctave: number } } } }).__synth.appStore.getState().kbdOctave);
  await tab('Sound').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Shape')).toBeFocused();
  await expect(tab('Shape')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tab('Composition')).toBeFocused();
  await page.keyboard.press('ArrowRight'); // wraps
  await expect(tab('Sound')).toBeFocused();
  await page.keyboard.press('ArrowLeft'); // wraps back
  await expect(tab('Composition')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab('Sound')).toBeFocused();
  // arrows on the tabs do not move the keyboard player's octave
  expect(await page.evaluate(() => (window as unknown as { __synth: { appStore: { getState(): { kbdOctave: number } } } }).__synth.appStore.getState().kbdOctave)).toBe(octave);
  // Tab leaves the tablist straight into the panel's controls
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tabpanel').locator(':focus')).toHaveCount(1);
});

test('the selected tab is remembered, and a broken storage falls back to Sound', async ({ page }) => {
  await page.goto('/');
  await openTab(page, 'Effects');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Effects' })).toHaveAttribute('aria-selected', 'true');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Sound' })).toHaveAttribute('aria-selected', 'true');
});

test('switching tabs does not change the patch or interrupt a held note', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[role=tabpanel]');
  await page.evaluate(() => {
    const s = (window as unknown as { __synth: Synth }).__synth;
    s.bus.emit('note:on', { pitch: 60, velocity: 100, source: 'keyboard', audioTime: 0 });
  });
  const before = await patchJson(page);
  for (const name of TABS) await openTab(page, name);
  expect(await patchJson(page)).toBe(before);
  expect(await page.evaluate(() => (window as unknown as { __synth: Synth }).__synth.notesStore.getState().held.has(60))).toBe(true);
});

test('opening help for a control on another tab selects that tab and highlights the control', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Sound' })).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => (window as unknown as { __synth: Synth }).__synth.helpStore.getState().open('filter-cutoff'));
  await expect(page.getByRole('tab', { name: 'Shape' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-help-for="filter-cutoff"].help-highlight').first()).toBeVisible();
  await page.evaluate(() => (window as unknown as { __synth: Synth }).__synth.helpStore.getState().open('effects'));
  await expect(page.getByRole('tab', { name: 'Effects' })).toHaveAttribute('aria-selected', 'true');
});

test('axe passes with each tab open', async ({ page }) => {
  await page.goto('/');
  for (const name of TABS) {
    await openTab(page, name);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'), name).toEqual([]);
  }
});

test('the scope keeps drawing on every tab while a note is held', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'needs a running audio clock');
  await page.goto('/');
  await page.getByRole('button', { name: /start audio/i }).click();
  await expect(page.getByRole('button', { name: /audio on/i })).toBeVisible();
  await page.evaluate(() => {
    const s = (window as unknown as { __synth: Synth }).__synth;
    s.engine.noteOn(57, 100);
    s.bus.emit('note:on', { pitch: 57, velocity: 100, source: 'keyboard', audioTime: s.host.currentTime });
  });
  for (const name of TABS) {
    await openTab(page, name);
    await page.waitForTimeout(300);
    const lit = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('canvas[data-viz=scope]')!;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]! - d[0]!) + Math.abs(d[i + 1]! - d[1]!) > 80) n++;
      return n / (d.length / 4);
    });
    expect(lit, `${name}: scope has a trace`).toBeGreaterThan(0.005);
  }
});
