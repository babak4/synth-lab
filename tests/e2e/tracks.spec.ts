import { test, expect, type Page } from '@playwright/test';
import { showTab } from './tabs';

type Eng = { getPatch(): { params: Record<string, number | string | boolean> }; getVoiceStates(): unknown[]; noteOn(p: number, v: number): void };
type Synth = {
  projectStore: { getState(): { project: { tempo: number; tracks: { id: string }[] }; selectedTrackId: string; addTrack(): void; selectTrack(id: string): void; removeTrack(id: string): void; duplicateTrack(id: string): void } };
  trackEngines: { count: number; get(id: string): Eng | undefined };
  mixer: { trackIds: string[] };
  bus: { emit(t: string, e: unknown): void };
};

const run = <T>(page: Page, fn: (s: Synth) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__synth)`) as Promise<T>;
const ready = async (page: Page) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid=synth-panel]');
  await showTab(page, 'Shape');
};
const cutoff = (page: Page) => page.getByRole('slider', { name: 'Cutoff' });

test('each track keeps its own sound; selecting a track swaps the panel without touching the others', async ({ page }) => {
  await ready(page);
  await cutoff(page).focus();
  await page.keyboard.press('Home'); // track 1 → 20 Hz
  const first = await run(page, (s) => s.projectStore.getState().selectedTrackId);
  await run(page, (s) => s.projectStore.getState().addTrack());
  await expect(cutoff(page)).toHaveAttribute('aria-valuenow', '8000'); // a fresh track's sound
  await cutoff(page).focus();
  await page.keyboard.press('End');
  const second = await run(page, (s) => s.projectStore.getState().selectedTrackId);
  expect(second).not.toBe(first);

  // The engines hold different sounds.
  const cutoffs = await page.evaluate(([a, b]) => {
    const s = (window as unknown as { __synth: Synth }).__synth;
    return [s.trackEngines.get(a!)!.getPatch().params['filter-cutoff'], s.trackEngines.get(b!)!.getPatch().params['filter-cutoff']];
  }, [first, second]);
  expect(cutoffs[0]).toBe(20);
  expect(cutoffs[1]).not.toBe(20);

  await page.evaluate((id) => (window as unknown as { __synth: Synth }).__synth.projectStore.getState().selectTrack(id), first);
  await expect(cutoff(page)).toHaveAttribute('aria-valuenow', '20');
  // Switching tracks keeps undo history, but every step belongs to the track it was made on (T5.3b):
  // undoing track 2's edit while track 1 is shown restores track 2's sound, shows track 2, and leaves track 1 alone.
  await page.getByRole('button', { name: 'Undo: Change Cutoff' }).click();
  expect(await run(page, (s) => s.projectStore.getState().selectedTrackId)).toBe(second);
  await expect(cutoff(page)).toHaveAttribute('aria-valuenow', '8000');
  const after = await page.evaluate((a) => (window as unknown as { __synth: Synth }).__synth.trackEngines.get(a)!.getPatch().params['filter-cutoff'], first);
  expect(after).toBe(20);
});

test('the keyboard plays the selected track only', async ({ page }) => {
  await ready(page);
  await run(page, (s) => s.projectStore.getState().addTrack());
  const [a, b] = await run(page, (s) => s.projectStore.getState().project.tracks.map((t) => t.id));
  await page.evaluate(() => (window as unknown as { __synth: Synth }).__synth.bus.emit('note:on', { pitch: 60, velocity: 100, source: 'keyboard', audioTime: 0 }));
  const voices = (id: string) => page.evaluate((i) => (window as unknown as { __synth: Synth }).__synth.trackEngines.get(i)!.getVoiceStates().length, id);
  await expect.poll(() => voices(b!)).toBe(1); // the new track is selected
  expect(await voices(a!)).toBe(0);
});

test('tracks are limited to 8, duplicates join the mixer, deleting disposes the engine', async ({ page }) => {
  await ready(page);
  for (let i = 0; i < 10; i++) await run(page, (s) => s.projectStore.getState().addTrack());
  await expect.poll(() => run(page, (s) => s.trackEngines.count)).toBe(8);
  expect(await run(page, (s) => s.projectStore.getState().project.tracks.length)).toBe(8);

  const victim = await run(page, (s) => s.projectStore.getState().selectedTrackId);
  await run(page, (s) => s.projectStore.getState().removeTrack(s.projectStore.getState().selectedTrackId));
  await expect.poll(() => run(page, (s) => s.trackEngines.count)).toBe(7);
  expect(await run(page, (s) => s.mixer.trackIds.length)).toBe(7);
  expect(await page.evaluate((id) => (window as unknown as { __synth: Synth }).__synth.mixer.trackIds.includes(id), victim)).toBe(false);

  const src = await run(page, (s) => s.projectStore.getState().project.tracks[0]!.id);
  await page.evaluate((id) => (window as unknown as { __synth: Synth }).__synth.projectStore.getState().duplicateTrack(id), src);
  await expect.poll(() => run(page, (s) => s.mixer.trackIds.length)).toBe(8);
});

test('the top-bar tempo edits the project', async ({ page }) => {
  await ready(page);
  await page.getByLabel('Tempo in beats per minute').fill('90');
  expect(await run(page, (s) => s.projectStore.getState().project.tempo)).toBe(90);
});
