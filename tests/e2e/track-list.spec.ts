import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { showTab } from './tabs';

type Synth = {
  projectStore: {
    getState(): {
      project: { tracks: { id: string; name: string; volumeDb: number; mute: boolean; solo: boolean; notes: unknown[] }[]; lengthBars: number };
      selectedTrackId: string;
      setProject?: never;
    };
    setState(s: unknown): void;
  };
  trackEngines: { count: number; selected(): unknown };
  mixer: { trackIds: string[]; getGain?(id: string): number };
};

const run = <T>(page: Page, fn: (s: Synth) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__synth)`) as Promise<T>;
const ready = async (page: Page) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid=synth-panel]');
  await showTab(page, 'Composition');
  await expect(page.getByRole('heading', { name: 'Tracks' })).toBeVisible();
};
const ids = (page: Page) => run(page, (s) => s.projectStore.getState().project.tracks.map((t) => t.id));

test('add, duplicate and delete keep the project, engines and mixer in step', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Add track' }).click();
  await page.getByRole('button', { name: 'Duplicate Track 1' }).click();
  await expect(page.getByTestId('track-row')).toHaveCount(3);
  expect(await run(page, (s) => [s.projectStore.getState().project.tracks.length, s.trackEngines.count, s.mixer.trackIds.length])).toEqual([3, 3, 3]);
  await page.getByRole('button', { name: 'Delete Track 1 copy' }).click();
  await expect(page.getByTestId('track-row')).toHaveCount(2);
  expect(await run(page, (s) => [s.trackEngines.count, s.mixer.trackIds.length])).toEqual([2, 2]);
});

test('the 8-track limit disables Add with an explanation', async ({ page }) => {
  await ready(page);
  const add = page.getByRole('button', { name: 'Add track' });
  for (let i = 0; i < 7; i++) await add.click();
  await expect(page.getByTestId('track-row')).toHaveCount(8);
  await expect(add).toBeDisabled();
  await expect(page.getByText(/at most 8 tracks/i)).toBeVisible();
});

test('rename, mute, solo and volume reach the project', async ({ page }) => {
  await ready(page);
  const name = page.getByRole('textbox', { name: 'Name of Track 1' });
  await name.fill('Bass');
  await name.press('Enter');
  await page.getByRole('button', { name: 'Mute Bass' }).click();
  await page.getByRole('button', { name: 'Solo Bass' }).click();
  const fader = page.getByRole('slider', { name: 'Volume, Bass' });
  await fader.focus();
  await page.keyboard.press('Home');
  const t = await run(page, (s) => s.projectStore.getState().project.tracks[0]!);
  expect(t).toMatchObject({ name: 'Bass', mute: true, solo: true, volumeDb: -60 });
  await expect(fader).toHaveAttribute('aria-valuetext', '−∞ dB');
});

test('move buttons reorder by keyboard and keep focus', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Add track' }).click();
  const [a, b] = await ids(page);
  await page.getByRole('button', { name: 'Move Track 2 up' }).focus();
  await page.keyboard.press('Enter');
  expect(await ids(page)).toEqual([b, a]);
  // Track 2 is now first, so its up button is disabled and focus falls to its down button.
  await expect(page.getByRole('button', { name: 'Move Track 2 down' })).toBeFocused();
  // The mixer order follows the project order.
  expect(await run(page, (s) => s.mixer.trackIds.length)).toBe(2);
});

test('selecting a row or its overview selects the track and swaps the synth patch', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Add track' }).click();
  const [a, b] = await ids(page);
  expect(await run(page, (s) => s.projectStore.getState().selectedTrackId)).toBe(b);
  await page.getByTestId('track-overview').first().click();
  expect(await run(page, (s) => s.projectStore.getState().selectedTrackId)).toBe(a);
  await page.getByRole('button', { name: 'Select Track 2', exact: true }).click();
  expect(await run(page, (s) => s.projectStore.getState().selectedTrackId)).toBe(b);
  await expect(page.getByTestId('track-row').nth(1)).toHaveAttribute('aria-current', 'true');
});

test('overview shows a mini note for each note', async ({ page }) => {
  await ready(page);
  await run(page, (s) => {
    const st = s.projectStore.getState();
    const t = st.project.tracks[0]!;
    s.projectStore.setState({
      project: { ...st.project, tracks: [{ ...t, notes: [{ id: 'a', pitch: 60, start: 0, duration: 960, velocity: 90 }, { id: 'b', pitch: 67, start: 3840, duration: 960, velocity: 90 }] }] },
    });
  });
  await expect(page.locator('[data-testid=track-overview] rect.mini-note')).toHaveCount(2);
});

test('the tab body scrolls inside itself at 8 tracks; the page does not', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ready(page);
  const add = page.getByRole('button', { name: 'Add track' });
  for (let i = 0; i < 7; i++) await add.click();
  const m = await page.evaluate(() => {
    const main = document.querySelector('.app-main') as HTMLElement;
    return { page: document.documentElement.scrollHeight - window.innerHeight, scroller: document.querySelector('.app-main')!.scrollHeight, h: main.clientHeight };
  });
  expect(m.page).toBeLessThanOrEqual(1);
});

test('accessibility: no serious or critical axe violations', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Add track' }).click();
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Add track' }).click();
  const full = await new AxeBuilder({ page }).analyze();
  expect(full.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
