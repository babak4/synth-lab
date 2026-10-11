import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { showTab } from './tabs';

// Piano roll editing (plan T5.3b). Every assertion is on application state (the project's notes, the
// edit store's selection, the undo labels), never on pixels. Pointer positions are computed from the
// roll's own view state, so the tests do not depend on layout.

type Note = { id: string; pitch: number; start: number; duration: number; velocity: number };
type Synth = {
  projectStore: {
    getState(): {
      project: { tracks: { id: string; notes: Note[] }[] };
      selectedTrackId: string;
      addTrack(): void;
      selectTrack(id: string): void;
      loadProject(p: unknown): void;
    };
  };
  patchStore: { getState(): { setParam(id: string, v: number): void; patch: { params: Record<string, number> } } };
  historyStore: { getState(): { canUndo: boolean; undoLabel: string | null; redoLabel: string | null } };
  transportStore: { getState(): { seek(t: number): void } };
  pianoRollEdit: { getState(): { selection: string[]; cursor: { tick: number; pitch: number } | null; clipboard: unknown; status: string; audition: { pitch: number; seq: number } | null; preview: unknown } };
  bus: { on(t: string, fn: (e: unknown) => void): () => void };
  trackEngines: { get(id: string): { getVoiceStates(): { held: boolean }[] } | undefined };
  pianoRoll: { view: { getState(): { viewport: { scrollTick: number; scrollY: number; pxPerTick: number; rowHeight: number } } }; frame(): { draws: number; selectedNotes: number } };
};

const run = <T>(page: Page, fn: (s: Synth) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__synth)`) as Promise<T>;
const KEY_WIDTH = 56;
const RULER_HEIGHT = 24;

test.use({ viewport: { width: 1280, height: 1500 } });

const stage = (page: Page) => page.getByRole('group', { name: /^Piano roll grid/ });
const notes = (page: Page) => run(page, (s) => JSON.parse(JSON.stringify(s.projectStore.getState().project.tracks[0]!.notes)) as Note[]);
const selectedNotes = (page: Page) => run(page, (s) => JSON.parse(JSON.stringify(s.projectStore.getState().project.tracks.find((t) => t.id === s.projectStore.getState().selectedTrackId)!.notes)) as Note[]);
const selection = (page: Page) => run(page, (s) => s.pianoRollEdit.getState().selection);
const byPitch = (list: Note[], pitch: number) => list.filter((n) => n.pitch === pitch);
const span = (n: Note) => [n.start, n.duration];
const undoLabel = (page: Page) => run(page, (s) => s.historyStore.getState().undoLabel);

const A: Note = { id: 'a', pitch: 60, start: 960, duration: 480, velocity: 100 };
const B: Note = { id: 'b', pitch: 64, start: 1920, duration: 480, velocity: 100 };
const C: Note = { id: 'c', pitch: 67, start: 3840, duration: 960, velocity: 100 };

/** Open the Composition tab on a one-track project holding `initial`. */
async function open(page: Page, initial: Note[] = [A, B, C]) {
  await page.goto('/');
  await page.waitForSelector('[role=tabpanel]');
  await page.evaluate((list) => {
    const s = (window as unknown as { __synth: Synth }).__synth;
    const p = JSON.parse(JSON.stringify(s.projectStore.getState().project));
    p.tracks[0].notes = list;
    s.projectStore.getState().loadProject(p);
  }, initial);
  await showTab(page, 'Composition');
  await expect.poll(async () => run(page, (s) => s.pianoRoll.frame().draws)).toBeGreaterThan(0);
  await stage(page).scrollIntoViewIfNeeded();
}

/** Page coordinates of the middle of a (tick, pitch) cell. */
async function at(page: Page, tick: number, pitch: number) {
  const box = (await stage(page).boundingBox())!;
  const v = await run(page, (s) => s.pianoRoll.view.getState().viewport);
  return {
    x: box.x + KEY_WIDTH + (tick - v.scrollTick) * v.pxPerTick,
    y: box.y + RULER_HEIGHT + (127 - pitch) * v.rowHeight - v.scrollY + v.rowHeight / 2,
  };
}

type Mod = 'Shift' | 'Alt';
const withMods = async (page: Page, mods: Mod[], fn: () => Promise<void>) => {
  for (const m of mods) await page.keyboard.down(m);
  try {
    await fn();
  } finally {
    for (const m of mods.reverse()) await page.keyboard.up(m);
  }
};

async function click(page: Page, tick: number, pitch: number, mods: Mod[] = []) {
  const p = await at(page, tick, pitch);
  await withMods(page, mods, async () => {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.up();
  });
}

async function drag(page: Page, from: [number, number], to: [number, number], mods: Mod[] = []) {
  const a = await at(page, from[0], from[1]);
  const b = await at(page, to[0], to[1]);
  await withMods(page, mods, async () => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 });
    await page.mouse.move(b.x, b.y, { steps: 3 });
    await page.mouse.up();
  });
}

const key = async (page: Page, k: string) => {
  await page.keyboard.press(k);
};
const undo = (page: Page) => key(page, 'Control+z');
const redo = (page: Page) => key(page, 'Control+Shift+z');
const focusStage = (page: Page) => stage(page).focus();

// ---------------------------------------------------------------------------------------------

test('click on empty grid adds a note of the current length, snapped to the cell; it is selected, auditioned and undoable', async ({ page }) => {
  await open(page, []);
  await run(page, (s) => {
    const w = window as unknown as { __on: unknown[] };
    w.__on = [];
    s.bus.on('note:on', (e) => w.__on.push(e));
    return 0;
  });
  await click(page, 1000, 62); // default snap 1/16 = 240 → the cell starting at 960; default length: a quarter note
  const list = await notes(page);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ pitch: 62, start: 960, duration: 960, velocity: 100 });
  expect(await selection(page)).toEqual([list[0]!.id]);
  const on = await page.evaluate(() => (window as unknown as { __on: { pitch: number; source: string }[] }).__on);
  expect(on.filter((e) => e.source === 'audition').map((e) => e.pitch)).toEqual([62]);
  expect(await undoLabel(page)).toBe('Add note');
  await expect(page.getByTestId('piano-roll-status')).toContainText('Added D4 quarter note at bar 1, beat 2');

  await undo(page);
  expect(await notes(page)).toHaveLength(0);
  await redo(page);
  expect(await notes(page)).toEqual(list);
});

test('length presets, dotted and triplet set the length of the next note', async ({ page }) => {
  await open(page, []);
  await page.getByRole('button', { name: /^Eighth note/ }).click();
  await click(page, 0, 60);
  await page.getByRole('button', { name: 'Dotted' }).click();
  await click(page, 1920, 60);
  await page.getByRole('button', { name: 'Triplet' }).click();
  await expect(page.getByRole('button', { name: 'Dotted' })).toHaveAttribute('aria-pressed', 'false'); // they exclude each other
  await page.getByRole('button', { name: /^Sixteenth note/ }).click();
  await click(page, 3840, 60);
  await page.getByRole('button', { name: /^Whole note/ }).click();
  await page.getByRole('button', { name: 'Triplet' }).click(); // off again
  await click(page, 5760, 60);
  expect((await notes(page)).map((n) => n.duration)).toEqual([480, 720, 160, 3840]);
});

test('the snap menu changes where notes land; off places freely; Alt bypasses snap for one click', async ({ page }) => {
  await open(page, []);
  const snap = page.getByLabel('Snap');
  await snap.selectOption('1/8');
  await click(page, 700, 60); // 480-cell
  await snap.selectOption('1/4T'); // 640
  await click(page, 1500, 62); // cell 1280
  await snap.selectOption('1/1');
  await click(page, 5000, 64); // 3840-cell
  expect((await notes(page)).map((n) => n.start)).toEqual([480, 1280, 3840]);

  await snap.selectOption('off');
  await click(page, 2501, 66);
  const free = byPitch(await notes(page), 66)[0]!;
  expect(Math.abs(free.start - 2501)).toBeLessThan(12); // pixel rounding only
  expect(free.start % 240).not.toBe(0);

  await snap.selectOption('1/16');
  await click(page, 3000, 68, ['Alt']); // Alt: free, though snap is on
  const alt = byPitch(await notes(page), 68)[0]!;
  expect(Math.abs(alt.start - 3000)).toBeLessThan(12);
  expect(alt.start % 240).not.toBe(0);
  await expect(snap).toHaveValue('1/16');
  // Every snap value is offered.
  const options = await snap.locator('option').allTextContents();
  expect(options).toEqual(['Off', '1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/1 triplet', '1/2 triplet', '1/4 triplet', '1/8 triplet', '1/16 triplet', '1/32 triplet']);
});

test('dragging on empty grid draws a note of that length (snapped), as one undo step', async ({ page }) => {
  await open(page, []);
  await drag(page, [500, 64], [1500, 64]); // starts in the 480 cell, ends at 1440
  const list = await notes(page);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ pitch: 64, start: 480, duration: 960 });
  expect(await undoLabel(page)).toBe('Draw note');
  await undo(page);
  expect(await notes(page)).toHaveLength(0);
  await redo(page);
  expect(await notes(page)).toHaveLength(1);
});

test('the project is untouched while a draw is in progress, and Escape cancels it', async ({ page }) => {
  await open(page, []);
  const a = await at(page, 480, 64);
  const b = await at(page, 2000, 64);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  expect(await notes(page)).toHaveLength(0);
  expect(await run(page, (s) => s.pianoRollEdit.getState().preview)).not.toBeNull();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await notes(page)).toHaveLength(0);
  expect(await run(page, (s) => s.pianoRollEdit.getState().preview)).toBeNull();
  expect(await run(page, (s) => s.historyStore.getState().canUndo)).toBe(false);
});

test('a drag never makes a zero or negative length note', async ({ page }) => {
  await open(page, [A]);
  await drag(page, [3000, 64], [2900, 64], ['Alt']); // backwards, snap bypassed
  await drag(page, [A.start + A.duration - 30, 60], [0, 60], ['Alt']); // shrink far past the start
  for (const n of await notes(page)) expect(n.duration).toBeGreaterThanOrEqual(1);
  expect(byPitch(await notes(page), 60)[0]!.duration).toBe(1);
  expect(byPitch(await notes(page), 64)[0]!.duration).toBe(1);
});

test('dragging a note moves it in time and pitch with snap, as one undo step; Alt moves freely', async ({ page }) => {
  await open(page);
  await drag(page, [1100, 60], [1600, 64]); // +500 ticks → start 1440 on the 240 grid
  let a = (await notes(page)).find((n) => n.id === 'a')!;
  expect(a).toMatchObject({ pitch: 64, start: 1440, duration: 480 });
  // pitch 64 was b's (start 1920): no overlap, nothing trimmed
  expect((await notes(page)).find((n) => n.id === 'b')).toMatchObject({ start: 1920, duration: 480 });
  expect(await undoLabel(page)).toBe('Move 1 note');
  await undo(page);
  a = (await notes(page)).find((n) => n.id === 'a')!;
  expect(a).toMatchObject({ pitch: 60, start: 960 });
  await redo(page);
  expect((await notes(page)).find((n) => n.id === 'a')).toMatchObject({ pitch: 64, start: 1440 });

  await drag(page, [1500, 64], [1837, 64], ['Alt']);
  a = (await notes(page)).find((n) => n.id === 'a')!;
  expect(a.start % 240).not.toBe(0);
  expect(Math.abs(a.start - (1440 + 337))).toBeLessThan(12);
});

test('a selected group moves together', async ({ page }) => {
  await open(page);
  await click(page, 1000, 60);
  await click(page, 2000, 64, ['Shift']);
  expect(await selection(page)).toEqual(['a', 'b']);
  await drag(page, [1000, 60], [1000 + 480, 62]);
  const list = await notes(page);
  expect(list.find((n) => n.id === 'a')).toMatchObject({ pitch: 62, start: 1440 });
  expect(list.find((n) => n.id === 'b')).toMatchObject({ pitch: 66, start: 2400 });
  expect(list.find((n) => n.id === 'c')).toMatchObject({ pitch: 67, start: 3840 });
  expect(await undoLabel(page)).toBe('Move 2 notes');
});

test('dragging the right edge resizes (end snaps to the grid), as one undo step', async ({ page }) => {
  await open(page);
  await drag(page, [A.start + A.duration - 30, 60], [1900, 60]); // grab inside the handle; the end moves by about +490 → 1920
  expect((await notes(page)).find((n) => n.id === 'a')).toMatchObject({ start: 960, duration: 960 });
  expect(await undoLabel(page)).toBe('Resize 1 note');
  await drag(page, [1890, 60], [0, 60]); // far left: stops at one grid step, never zero
  expect((await notes(page)).find((n) => n.id === 'a')!.duration).toBe(240);
  await undo(page);
  await undo(page);
  expect((await notes(page)).find((n) => n.id === 'a')!.duration).toBe(480);
});

test('overlap policy: a note put on a same-pitch note trims it (and one undo restores both)', async ({ page }) => {
  await open(page, [A]);
  await drag(page, [480, 60], [1200, 60]); // new note [480, 1200) lands on A's head
  let list = byPitch(await notes(page), 60);
  expect(list.map(span)).toEqual([[480, 720], [1200, 240]]);
  expect(list.map((n) => n.id)).toContain('a');
  await undo(page);
  list = byPitch(await notes(page), 60);
  expect(list.map(span)).toEqual([[960, 480]]);

  // A new note swallowing A removes it.
  await page.getByRole('button', { name: /^Whole note/ }).click();
  await click(page, 100, 60);
  list = byPitch(await notes(page), 60);
  expect(list.map(span)).toEqual([[0, 3840]]);
  await undo(page);
  expect(byPitch(await notes(page), 60).map(span)).toEqual([[960, 480]]);
});

test('click selects, shift-click toggles, a box selects, Ctrl+A selects all, Escape clears', async ({ page }) => {
  await open(page);
  await click(page, 1000, 60);
  expect(await selection(page)).toEqual(['a']);
  await click(page, 2000, 64, ['Shift']);
  expect(await selection(page)).toEqual(['a', 'b']);
  await click(page, 1000, 60, ['Shift']);
  expect(await selection(page)).toEqual(['b']);
  await expect.poll(async () => run(page, (s) => s.pianoRoll.frame().selectedNotes)).toBe(1);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await click(page, 6000, 70); // empty space with the select tool clears
  expect(await selection(page)).toEqual([]);
  expect(await notes(page)).toHaveLength(3); // and adds nothing
  await drag(page, [500, 58], [2500, 65]); // a box over A and B
  expect((await selection(page)).sort()).toEqual(['a', 'b']);
  await drag(page, [3500, 66], [5200, 69], ['Shift']); // shift adds C
  expect((await selection(page)).sort()).toEqual(['a', 'b', 'c']);
  expect(await run(page, (s) => s.historyStore.getState().canUndo)).toBe(false); // selecting is not an edit

  await click(page, 6000, 70);
  expect(await selection(page)).toEqual([]);
  await focusStage(page);
  await key(page, 'Control+a');
  expect((await selection(page)).sort()).toEqual(['a', 'b', 'c']);
  await key(page, 'Escape');
  expect(await selection(page)).toEqual([]);
});

test('in the draw tool, a shift-drag on empty space is a box select, not a new note', async ({ page }) => {
  await open(page);
  await drag(page, [500, 58], [1500, 62], ['Shift']);
  expect(await selection(page)).toEqual(['a']);
  expect(await notes(page)).toHaveLength(3);
});

test('Delete and Backspace remove the selection; undo and redo bring it back and take it away', async ({ page }) => {
  await open(page);
  await click(page, 1000, 60);
  await key(page, 'Delete');
  expect((await notes(page)).map((n) => n.id)).toEqual(['b', 'c']);
  expect(await undoLabel(page)).toBe('Delete 1 note');
  await click(page, 2000, 64);
  await click(page, 4000, 67, ['Shift']);
  await key(page, 'Backspace');
  expect(await notes(page)).toHaveLength(0);
  await undo(page);
  expect((await notes(page)).map((n) => n.id)).toEqual(['b', 'c']);
  await undo(page);
  expect((await notes(page)).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  await redo(page);
  await redo(page);
  expect(await notes(page)).toHaveLength(0);
});

test('Ctrl+D duplicates the selection right after itself and selects the copies', async ({ page }) => {
  await open(page);
  await click(page, 2000, 64);
  await key(page, 'Control+d');
  const list = await notes(page);
  expect(list).toHaveLength(4);
  const copy = list.find((n) => !['a', 'b', 'c'].includes(n.id))!;
  expect(copy).toMatchObject({ pitch: 64, start: 2400, duration: 480 });
  expect(await selection(page)).toEqual([copy.id]);
  expect(await undoLabel(page)).toBe('Duplicate 1 note');
  await undo(page);
  expect(await notes(page)).toHaveLength(3);
  await redo(page);
  expect(await notes(page)).toHaveLength(4);
});

test('copy, cut and paste land at the playhead, are undoable, and paste works on another track', async ({ page }) => {
  await open(page);
  await click(page, 1000, 60);
  await click(page, 2000, 64, ['Shift']);
  await key(page, 'Control+c');
  expect(await run(page, (s) => s.historyStore.getState().canUndo)).toBe(false);
  await run(page, (s) => s.transportStore.getState().seek(7680));
  await key(page, 'Control+v');
  let list = await notes(page);
  const pasted = list.filter((n) => n.start >= 7680);
  expect(pasted.map((n) => [n.pitch, n.start, n.duration])).toEqual([[60, 7680, 480], [64, 8640, 480]]); // the song is 8 bars = 30720 ticks
  expect((await selection(page)).sort()).toEqual(pasted.map((n) => n.id).sort());
  await undo(page);
  expect(await notes(page)).toHaveLength(3);

  // Cut C, then paste it into a new track at the playhead.
  await click(page, 4000, 67);
  await key(page, 'Control+x');
  expect((await notes(page)).map((n) => n.id)).toEqual(['a', 'b']);
  await run(page, (s) => {
    s.projectStore.getState().addTrack();
    s.transportStore.getState().seek(960);
  });
  await focusStage(page);
  await key(page, 'Control+v');
  list = await selectedNotes(page);
  expect(list.map((n) => [n.pitch, n.start, n.duration])).toEqual([[67, 960, 960]]);
});

test('arrow keys transpose by a semitone, by an octave with Shift, and nudge by the snap step', async ({ page }) => {
  await open(page);
  await click(page, 1000, 60);
  await key(page, 'ArrowUp');
  expect((await notes(page)).find((n) => n.id === 'a')!.pitch).toBe(61);
  await key(page, 'Shift+ArrowDown');
  expect((await notes(page)).find((n) => n.id === 'a')!.pitch).toBe(49);
  await key(page, 'Shift+ArrowUp');
  await key(page, 'ArrowDown');
  expect((await notes(page)).find((n) => n.id === 'a')!.pitch).toBe(60);
  expect(await undoLabel(page)).toBe('Transpose 1 note');

  await key(page, 'ArrowRight'); // 1/16 = 240
  expect((await notes(page)).find((n) => n.id === 'a')!.start).toBe(1200);
  await key(page, 'Shift+ArrowRight'); // a beat
  expect((await notes(page)).find((n) => n.id === 'a')!.start).toBe(2160);
  await key(page, 'ArrowLeft');
  expect((await notes(page)).find((n) => n.id === 'a')!.start).toBe(1920);
  await page.getByLabel('Snap').selectOption('1/8');
  await focusStage(page);
  await key(page, 'ArrowLeft');
  expect((await notes(page)).find((n) => n.id === 'a')!.start).toBe(1440);

  // Each key press is its own undo step (held-key repeats would merge).
  await undo(page);
  expect((await notes(page)).find((n) => n.id === 'a')!.start).toBe(1920);
  await undo(page);
  expect((await notes(page)).find((n) => n.id === 'a')!.start).toBe(2160);
  await redo(page);
  await redo(page);
  expect((await notes(page)).find((n) => n.id === 'a')!.start).toBe(1440);
});

test('transposing a group stops at the top of the keyboard instead of squashing it', async ({ page }) => {
  await open(page, [{ id: 'hi', pitch: 126, start: 0, duration: 480, velocity: 100 }, { id: 'lo', pitch: 120, start: 960, duration: 480, velocity: 100 }]);
  await focusStage(page);
  await key(page, 'Control+a');
  await key(page, 'Shift+ArrowUp');
  expect((await notes(page)).map((n) => n.pitch)).toEqual([127, 121]);
  await key(page, 'ArrowUp');
  await expect(page.getByTestId('piano-roll-status')).toContainText('Already at the highest pitch');
});

test('every edit is one step in the SAME undo stack as sound edits, in order, via the top-bar buttons and the keyboard', async ({ page }) => {
  await open(page, []);
  await run(page, (s) => s.patchStore.getState().setParam('filter-cutoff', 1000));
  await click(page, 960, 60);
  await key(page, 'ArrowUp'); // transpose the new note
  await expect(page.getByRole('button', { name: 'Undo: Transpose 1 note' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo: Transpose 1 note' }).click();
  await expect(page.getByRole('button', { name: 'Undo: Add note' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo: Add note' }).click();
  expect(await notes(page)).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Undo: Change Cutoff' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo: Change Cutoff' }).click();
  expect(await run(page, (s) => s.patchStore.getState().patch.params['filter-cutoff'])).toBe(8000);
  await page.getByRole('button', { name: 'Redo: Change Cutoff' }).click();
  await page.getByRole('button', { name: 'Redo: Add note' }).click();
  expect(await notes(page)).toHaveLength(1);
});

test('undo survives a track switch and brings you to the track the step belongs to', async ({ page }) => {
  await open(page, []);
  const first = await run(page, (s) => s.projectStore.getState().selectedTrackId);
  await click(page, 960, 60);
  await run(page, (s) => s.projectStore.getState().addTrack());
  expect(await run(page, (s) => s.historyStore.getState().canUndo)).toBe(true);
  expect(await selectedNotes(page)).toHaveLength(0); // the new track is empty
  await undo(page); // the add on track 1
  expect(await run(page, (s) => s.projectStore.getState().selectedTrackId)).toBe(first);
  expect(await notes(page)).toHaveLength(0);
  await redo(page);
  expect(await notes(page)).toHaveLength(1);
});

test('keyboard-only editing: Enter starts entry, arrows move the cursor, Enter adds and steps on, all announced', async ({ page }) => {
  await open(page, []);
  const status = page.getByTestId('piano-roll-status');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await focusStage(page);
  await key(page, 'ArrowDown'); // no cursor yet: the view scrolls
  expect(await run(page, (s) => s.pianoRollEdit.getState().cursor)).toBeNull();
  await key(page, 'Enter');
  await expect(status).toContainText('Keyboard entry on');
  const c0 = (await run(page, (s) => s.pianoRollEdit.getState().cursor))!;
  expect(c0.tick).toBe(0);

  await key(page, 'ArrowUp');
  await key(page, 'ArrowUp');
  await key(page, 'Shift+ArrowDown');
  await key(page, 'ArrowRight');
  await expect(status).toContainText(/bar 1, beat 1 plus 240 ticks/);
  const c1 = (await run(page, (s) => s.pianoRollEdit.getState().cursor))!;
  expect(c1).toEqual({ tick: 240, pitch: c0.pitch + 2 - 12 });

  await key(page, 'Enter');
  let list = await notes(page);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ pitch: c1.pitch, start: 240, duration: 960 });
  await expect(status).toContainText('Added');
  expect((await run(page, (s) => s.pianoRollEdit.getState().cursor))!.tick).toBe(240 + 960); // ready for the next note
  await key(page, 'Enter');
  expect(await notes(page)).toHaveLength(2);

  // Back onto the first note, Enter selects it, arrows now edit it, Delete removes it.
  await key(page, 'ArrowLeft'); // one grid step back from the cursor's tick
  await key(page, 'Escape'); // leaves keyboard entry
  expect(await run(page, (s) => s.pianoRollEdit.getState().cursor)).toBeNull();
  await key(page, 'Control+a');
  await key(page, 'Delete');
  expect(await notes(page)).toHaveLength(0);
  await undo(page);
  list = await notes(page);
  expect(list).toHaveLength(2);
});

test('the grid keeps its accessible name, and the editing controls are labelled; axe is clean with a note selected', async ({ page }) => {
  await open(page);
  await click(page, 1000, 60);
  await expect(stage(page)).toHaveAccessibleName('Piano roll grid for Track 1, 3 notes');
  await expect(page.getByRole('toolbar', { name: 'Piano roll editing' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Tool' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Note length' })).toBeVisible();
  await expect(page.getByLabel('Snap')).toBeVisible();
  await focusStage(page);
  await key(page, 'Enter'); // show the cursor too
  expect(await selection(page)).toEqual(['a']);
  const results = await new AxeBuilder({ page }).include('[role=tabpanel]').analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('editing keys in the roll never reach the laptop keyboard player (no stray notes)', async ({ page }) => {
  await open(page);
  await click(page, 1000, 60);
  await run(page, (s) => {
    const w = window as unknown as { __kb: unknown[] };
    w.__kb = [];
    s.bus.on('note:on', (e) => w.__kb.push(e));
    return 0;
  });
  await key(page, 'ArrowUp');
  await key(page, 'Control+d');
  const events = await page.evaluate(() => (window as unknown as { __kb: { source: string }[] }).__kb);
  expect(events.filter((e) => e.source === 'keyboard')).toEqual([]);
});

test('Shift+Up/Down in the roll never engages the sustain pedal, so audition notes end by themselves', async ({ page }) => {
  await open(page);
  await click(page, 1000, 60);
  await run(page, (s) => {
    const w = window as unknown as { __sustain: unknown[] };
    w.__sustain = [];
    s.bus.on('sustain', (e) => w.__sustain.push(e));
    return 0;
  });
  for (let i = 0; i < 4; i++) await key(page, 'Shift+ArrowUp'); // an octave each; repeated presses must not pile up voices
  await key(page, 'Shift+ArrowDown');
  expect((await notes(page)).find((n) => n.id === 'a')!.pitch).toBe(60 + 36);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as unknown as { __sustain: unknown[] }).__sustain)).toEqual([]);
  await expect
    .poll(() => run(page, (s) => s.projectStore.getState().project.tracks.map((t) => s.trackEngines.get(t.id)?.getVoiceStates().filter((v) => v.held).length ?? 0)))
    .toEqual([0]);
});

/** Dispatch a synthetic pointer event on the grid (for cases a real mouse cannot produce). */
const pointerEvent = (page: Page, type: string, init: Record<string, unknown>) =>
  page.evaluate(
    ([t, i]) => {
      const el = document.querySelector('[aria-label^="Piano roll grid"]')!;
      el.dispatchEvent(new PointerEvent(t as string, { bubbles: true, cancelable: true, ...(i as object) }));
    },
    [type, init] as const,
  );
const preview = (page: Page) => run(page, (s) => s.pianoRollEdit.getState().preview as { notes: Note[] | null } | null);

test('a lost pointer-up is recovered: a move with no button down ends the gesture without committing', async ({ page }) => {
  await open(page, []);
  const a = await at(page, 480, 64);
  const b = await at(page, 1500, 64);
  await page.evaluate(() => {
    document.querySelector('[aria-label^="Piano roll grid"]')!.addEventListener('pointerdown', (e) => ((window as unknown as { __pid: number }).__pid = (e as PointerEvent).pointerId), { once: true });
  });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  expect(await preview(page)).not.toBeNull();
  const pointerId = await page.evaluate(() => (window as unknown as { __pid: number }).__pid);
  await pointerEvent(page, 'pointermove', { pointerId, pointerType: 'mouse', buttons: 0, clientX: b.x + 5, clientY: b.y });
  expect(await preview(page)).toBeNull();
  await page.mouse.up();
  expect(await notes(page)).toHaveLength(0);
});

test('a pen eraser (button 5) does not start an edit', async ({ page }) => {
  await open(page, []);
  const p = await at(page, 960, 62);
  const init = { pointerId: 77, pointerType: 'pen', clientX: p.x, clientY: p.y };
  await pointerEvent(page, 'pointerdown', { ...init, button: 5, buttons: 32 });
  await pointerEvent(page, 'pointerup', { ...init, button: 5, buttons: 0 });
  expect(await notes(page)).toHaveLength(0);
  // The pen tip (button 0) still draws.
  await pointerEvent(page, 'pointerdown', { ...init, button: 0, buttons: 1 });
  await pointerEvent(page, 'pointerup', { ...init, button: 0, buttons: 0 });
  expect(await notes(page)).toHaveLength(1);
});

test('scrolling the roll with the wheel during a drag refreshes the preview from the last pointer position', async ({ page }) => {
  await open(page, []);
  const a = await at(page, 480, 64);
  const b = await at(page, 900, 64);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  const before = (await preview(page))!.notes![0]!.duration;
  await page.mouse.wheel(300, 0); // the view moves later in time under the stationary pointer
  await expect.poll(async () => (await preview(page))!.notes![0]!.duration).toBeGreaterThan(before);
  await page.mouse.up();
  expect((await notes(page))[0]!.duration).toBeGreaterThan(before);
});
