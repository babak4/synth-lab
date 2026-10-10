import { test, expect, type Page } from '@playwright/test';

interface Track {
  id: string;
  notes: { id: string; pitch: number; start: number; duration: number; velocity: number }[];
}
type Synth = {
  projectStore: {
    getState(): {
      project: { tempo: number; lengthBars: number; loop: { enabled: boolean; startBar: number; endBar: number }; tracks: Track[] };
      setTempo(bpm: number): void;
      setLoop(l: { enabled?: boolean; startBar?: number; endBar?: number }): void;
      loadProject(p: unknown): void;
    };
  };
  transportStore: {
    getState(): {
      state: string;
      startTick: number;
      metronome: boolean;
      countIn: boolean;
      getPosition(): number;
      play(): void;
      stop(): void;
    };
  };
  trackEngines: { get(id: string): { getVoiceStates(): { pitch: number }[] } | undefined };
  notesStore: { getState(): { held: ReadonlyMap<number, number> } };
};

const run = <T>(page: Page, fn: (s: Synth) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__synth)`) as Promise<T>;
const runWith = <T, A>(page: Page, arg: A, fn: (s: Synth, a: A) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__synth, ${JSON.stringify(arg)})`) as Promise<T>;

const state = (page: Page) => run(page, (s) => s.transportStore.getState().state);
const position = (page: Page) => run(page, (s) => s.transportStore.getState().getPosition());
const voices = (page: Page) =>
  run(page, (s) => {
    const id = s.projectStore.getState().project.tracks[0]!.id;
    return s.trackEngines.get(id)!.getVoiceStates().length;
  });

/** Replace the first track's notes. */
const setNotes = (page: Page, notes: Track['notes']) =>
  runWith(page, notes, (s, n) => {
    const p = s.projectStore.getState().project;
    s.projectStore.getState().loadProject({ ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, notes: n } : t)) });
  });

const note = (id: string, pitch: number, start: number, duration: number) => ({ id, pitch, start, duration, velocity: 100 });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid=synth-panel]');
  await page.waitForFunction(() => (window as unknown as { __synth?: unknown }).__synth !== undefined);
});

test('transport controls are named, and Play / Stop / Return to start drive the transport state', async ({ page }) => {
  for (const name of ['Return to start', 'Play', 'Loop', 'Metronome', 'Count-in']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // The readout is a timer, not a live region, so screen readers do not announce every beat.
  await expect(page.getByRole('timer', { name: 'Position (bar.beat)' })).toHaveAttribute('aria-live', 'off');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await expect.poll(() => state(page)).toBe('playing');
  await expect.poll(() => position(page)).toBeGreaterThan(200); // the playhead moves

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(() => state(page)).toBe('stopped');
  const rest = await position(page);
  expect(rest).toBeGreaterThan(200);
  await page.waitForTimeout(150);
  expect(await position(page)).toBe(rest); // stays where it stopped

  await page.getByRole('button', { name: 'Return to start', exact: true }).click();
  expect(await position(page)).toBe(0);
  await expect(page.getByTestId('transport-position')).toHaveText('1.1');
});

test('Loop, Metronome and Count-in are toggles that reach the state', async ({ page }) => {
  const loop = page.getByRole('button', { name: 'Loop', exact: true });
  await expect(loop).toHaveAttribute('aria-pressed', 'true'); // a new project loops its whole length
  await loop.click();
  await expect(loop).toHaveAttribute('aria-pressed', 'false');
  expect(await run(page, (s) => s.projectStore.getState().project.loop.enabled)).toBe(false);

  const metro = page.getByRole('button', { name: 'Metronome', exact: true });
  await metro.click();
  await expect(metro).toHaveAttribute('aria-pressed', 'true');
  expect(await run(page, (s) => s.transportStore.getState().metronome)).toBe(true);

  const count = page.getByRole('button', { name: 'Count-in', exact: true });
  await count.click();
  await expect(count).toHaveAttribute('aria-pressed', 'true');
  expect(await run(page, (s) => s.transportStore.getState().countIn)).toBe(true);
});

test('Space plays and stops, Home returns to the start', async ({ page }) => {
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect.poll(() => state(page)).toBe('playing');
  await page.keyboard.press('Space');
  await expect.poll(() => state(page)).toBe('stopped');
  await run(page, (s) => s.transportStore.getState().play());
  await expect.poll(() => position(page)).toBeGreaterThan(100);
  await page.keyboard.press('Home');
  await expect.poll(() => state(page)).toBe('playing');
  await run(page, (s) => s.transportStore.getState().stop());
  await page.keyboard.press('Home');
  expect(await position(page)).toBe(0);
});

test('sequenced notes sound on the track engine and on the on-screen display, and stop leaves nothing hanging', async ({ page }) => {
  await setNotes(page, [note('a', 60, 0, 3840 * 4)]);
  expect(await voices(page)).toBe(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => voices(page)).toBe(1);
  await expect.poll(() => run(page, (s) => s.notesStore.getState().held.has(60))).toBe(true);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(() => voices(page), { timeout: 5000 }).toBe(0);
  await expect.poll(() => run(page, (s) => s.notesStore.getState().held.size)).toBe(0);
});

test('a note added while playing starts without a restart, and deleting a sounding note releases it', async ({ page }) => {
  await run(page, (s) => s.projectStore.getState().setTempo(240));
  await setNotes(page, []);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => position(page)).toBeGreaterThan(100);
  expect(await voices(page)).toBe(0);
  // 240 BPM: a bar is 1 s. A long note one bar ahead of the playhead (clear of the scheduling window).
  const ahead = (await position(page)) + 3840;
  await setNotes(page, [note('late', 64, Math.ceil(ahead), 3840 * 3)]);
  await expect.poll(() => voices(page)).toBe(1);
  await setNotes(page, []);
  await expect.poll(() => voices(page), { timeout: 5000 }).toBe(0);
});

test('with loop on, the playhead wraps at the loop end and keeps going', async ({ page }) => {
  await run(page, (s) => {
    s.projectStore.getState().setTempo(240);
    s.projectStore.getState().setLoop({ enabled: true, startBar: 0, endBar: 1 }); // one bar = 1 s at 240 BPM
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const seen: number[] = [];
  let wraps = 0;
  for (let i = 0; i < 60 && wraps < 2; i++) {
    const p = await position(page);
    if (seen.length && p < seen.at(-1)!) wraps++;
    seen.push(p);
    expect(p).toBeLessThanOrEqual(3840);
    await page.waitForTimeout(50);
  }
  expect(wraps).toBeGreaterThanOrEqual(2);
  expect(await state(page)).toBe('playing');
});

test('without a loop, playback ends at the song end and the transport rewinds', async ({ page }) => {
  await run(page, (s) => {
    s.projectStore.getState().setTempo(240);
    s.projectStore.getState().setLoop({ enabled: false });
    const p = s.projectStore.getState().project;
    s.projectStore.getState().loadProject({ ...p, lengthBars: 1, loop: { enabled: false, startBar: 0, endBar: 1 } });
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('stopped');
  expect(await position(page)).toBe(0);
});

test('count-in plays a bar of clicks first, then the transport is playing', async ({ page }) => {
  await run(page, (s) => s.projectStore.getState().setTempo(120)); // a 2 s count-in
  await page.getByRole('button', { name: 'Count-in', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => state(page)).toBe('count-in');
  expect(await position(page)).toBe(0);
  await expect.poll(() => state(page), { timeout: 10_000 }).toBe('playing');
  await expect.poll(() => position(page)).toBeGreaterThan(0);
});
