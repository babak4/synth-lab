import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

const drawer = (page: Page) => page.getByTestId('help-drawer');
const title = (page: Page) => page.getByTestId('help-title');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForSelector('[data-testid=synth-panel]');
});

test('opens help from five different controls and highlights what each describes', async ({ page }) => {
  const cases: [string, string, string][] = [
    ['Help: Cutoff', 'Filter cutoff', 'filter-cutoff'],
    ['Help: Resonance', 'Filter resonance', 'filter-resonance'],
    ['Help: Amp attack', 'Amp envelope attack', 'amp-env-attack'],
    ['Help: Rate', 'LFO rate', 'lfo-rate'],
    ['Help: Reverb on', 'Reverb on', 'reverb-on'],
  ];
  for (const [button, heading, id] of cases) {
    await page.getByRole('button', { name: button, exact: true }).click({ force: true });
    await expect(title(page)).toHaveText(heading);
    await expect(page.locator(`[data-help-for="${id}"].help-highlight`).first()).toBeVisible();
    await expect(drawer(page)).toContainText('What it does.');
  }
  // only the current entry is highlighted
  expect(await page.locator('.help-highlight').count()).toBe(1);
});

test('the drawer sits beside the synth, never over it: controls stay visible and usable', async ({ page }) => {
  await page.getByRole('button', { name: 'Help: Filter', exact: true }).click();
  await expect(drawer(page)).toBeVisible();
  const d = (await drawer(page).boundingBox())!;
  for (const name of ['Cutoff', 'Resonance']) {
    const b = (await page.getByRole('slider', { name }).boundingBox())!;
    expect(b.x + b.width, `${name} is left of the drawer`).toBeLessThanOrEqual(d.x);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  // still playable: change a knob with the drawer open
  await page.getByRole('slider', { name: 'Cutoff' }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('slider', { name: 'Cutoff' })).toHaveAttribute('aria-valuenow', '20');
});

test('section entries follow the template and the filter section highlights the whole section', async ({ page }) => {
  await page.getByRole('button', { name: 'Help: Filter', exact: true }).click();
  await expect(title(page)).toHaveText('Filter');
  for (const h of ['What it is', "What you'll hear", 'Try this', 'The controls', 'Beyond this synth', "Where you've heard it", 'Related']) {
    await expect(drawer(page).getByRole('heading', { name: h })).toBeVisible();
  }
  await expect(page.locator('section.section.help-highlight')).toHaveCount(1);
});

test('back and forward move through the entries visited; links navigate', async ({ page }) => {
  await page.getByRole('button', { name: 'Help: Filter', exact: true }).click();
  await drawer(page).getByRole('button', { name: 'Cutoff', exact: true }).first().click();
  await expect(title(page)).toHaveText('Filter cutoff');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(title(page)).toHaveText('Filter');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Forward', exact: true }).click();
  await expect(title(page)).toHaveText('Filter cutoff');
  await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeDisabled();
});

test('each entry remembers its scroll position', async ({ page }) => {
  await page.getByRole('button', { name: 'Help: Oscillators', exact: true }).click();
  const body = page.locator('.help-body');
  await expect(title(page)).toHaveText('Oscillators');
  await body.evaluate((el) => (el.scrollTop = 400));
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: 'Help: Mixer', exact: true }).click();
  await expect(title(page)).toHaveText('Mixer');
  expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(title(page)).toHaveText('Oscillators');
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(300);
});

test('glossary terms are underlined and reveal a one-line definition on hover and focus', async ({ page }) => {
  await page.getByRole('button', { name: 'Help: Oscillators', exact: true }).click();
  const term = drawer(page).locator('.term').first();
  await expect(term.locator('.term-tip')).toBeHidden();
  await term.hover();
  await expect(term.locator('.term-tip')).toBeVisible();
  await page.mouse.move(0, 0);
  await term.focus();
  await expect(term.locator('.term-tip')).toBeVisible();
});

test('"?" opens help for the focused control, "?" with nothing focused opens the index, Esc closes', async ({ page }) => {
  await page.getByRole('slider', { name: 'Resonance' }).focus();
  await page.keyboard.press('Shift+Slash');
  await expect(title(page)).toHaveText('Filter resonance');
  // "?" plays no note
  expect(await page.evaluate(() => (window as unknown as { __synth: { engine: { getVoiceStates(): unknown[] } } }).__synth.engine.getVoiceStates().length)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  // Esc used by the drawer must not also fire the keyboard player's panic
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Shift+Slash');
  await expect(title(page)).toHaveText('Help index');
});

test('the index lists every section and control in signal-flow order', async ({ page }) => {
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(title(page)).toHaveText('Help index');
  const nav = drawer(page).getByRole('navigation', { name: 'Help index' });
  const sections = await nav.locator('.section-link').allTextContents();
  expect(sections.slice(0, 4)).toEqual(['Oscillators', 'Mixer', 'Filter', 'Envelopes']);
  expect(sections.length).toBe(10);
  expect(await nav.locator('a, button').count()).toBe(10 + 59);
});

test('Try this: Set it up changes the sound, A/B switches, Undo restores', async ({ page }) => {
  await page.getByRole('button', { name: 'Help: Filter', exact: true }).click();
  const patchValue = () => page.evaluate(() => (window as unknown as { __synth: { patchStore: { getState(): { patch: { params: Record<string, number> } } } } }).__synth.patchStore.getState().patch.params['filter-cutoff']);
  const card = drawer(page).getByRole('article', { name: 'Experiment: Close the filter' });
  await card.getByRole('button', { name: 'Set it up' }).click();
  expect(await patchValue()).toBe(500);
  await card.getByRole('button', { name: /^A\/B/ }).click();
  expect(await patchValue()).toBe(8000);
  await card.getByRole('button', { name: /^A\/B/ }).click();
  expect(await patchValue()).toBe(500);
  await card.getByRole('button', { name: 'Undo' }).click();
  expect(await patchValue()).toBe(8000);
});

test('accessibility: no serious or critical axe violations with the drawer open', async ({ page }) => {
  await page.getByRole('button', { name: 'Help: Filter', exact: true }).click();
  await expect(title(page)).toHaveText('Filter');
  const results = await new AxeBuilder({ page }).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes; e.g. ${v.nodes[0]?.target.join(' ')})`)).toEqual([]);
});

test.describe('animated diagrams (T4.5)', () => {
  const bars = (page: Page) => page.locator('.diagram .bar').evaluateAll((els) => els.map((e) => Number(e.getAttribute('height'))));

  test('the harmonic bars show the sawtooth series 1/n and the square series (odd only)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // static frame, deterministic
    await page.getByRole('button', { name: 'Help: Oscillators', exact: true }).click();
    const saw = await bars(page);
    expect(saw[1]! / saw[0]!).toBeCloseTo(1 / 2, 2);
    expect(saw[3]! / saw[0]!).toBeCloseTo(1 / 4, 2);
    await drawer(page).getByRole('button', { name: 'Square', exact: true }).click();
    const sq = await bars(page);
    expect(sq[1]).toBe(0); // no even harmonics
    expect(sq[2]! / sq[0]!).toBeCloseTo(1 / 3, 2);
    await drawer(page).getByRole('button', { name: 'Triangle', exact: true }).click();
    const tri = await bars(page);
    expect(tri[2]! / tri[0]!).toBeCloseTo(1 / 9, 2);
  });

  test('with reduced motion a diagram holds one frame; otherwise it animates', async ({ page }) => {
    const frame = async () => page.locator('.diagram').nth(2).innerHTML(); // the unison diagram
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Help: Oscillators', exact: true }).click();
    const a = await frame();
    await page.waitForTimeout(500);
    expect(await frame()).toBe(a);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(600);
    const b = await frame();
    await page.waitForTimeout(500);
    expect(await frame()).not.toBe(b);
  });

  test('every diagram named in the content renders', async ({ page }) => {
    for (const [button, count] of [['Help: Oscillators', 3], ['Help: Filter', 1], ['Help: Amp envelope', 1], ['Help: LFO', 1]] as const) {
      await page.getByRole('button', { name: button, exact: true }).click();
      await expect(drawer(page).locator('figure.diagram')).toHaveCount(count);
    }
  });
});
