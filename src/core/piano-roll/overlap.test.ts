import { describe, expect, it } from 'vitest';
import type { Note } from '../contracts/project';
import { applyDiff, applyEdit, diffNotes, editLimit, invertDiff, normalizeNote, resolveOverlaps, sortNotes } from './overlap';

const n = (id: string, pitch: number, start: number, duration: number, velocity = 100): Note => ({ id, pitch, start, duration, velocity });
const LIMIT = 3840 * 4;

/** No two notes of one pitch overlap, and every note is valid. */
function expectValid(notes: readonly Note[], limit = Infinity) {
  for (const a of notes) {
    expect(a.duration).toBeGreaterThanOrEqual(1);
    expect(a.start).toBeGreaterThanOrEqual(0);
    expect(a.start + a.duration).toBeLessThanOrEqual(limit);
    expect(a.pitch).toBeGreaterThanOrEqual(0);
    expect(a.pitch).toBeLessThanOrEqual(127);
    expect(a.velocity).toBeGreaterThanOrEqual(1);
    expect(a.velocity).toBeLessThanOrEqual(127);
    expect(Number.isInteger(a.start) && Number.isInteger(a.duration) && Number.isInteger(a.pitch)).toBe(true);
  }
  for (const a of notes)
    for (const b of notes) if (a !== b && a.pitch === b.pitch) expect(a.start < b.start + b.duration && b.start < a.start + a.duration, `${a.id} overlaps ${b.id}`).toBe(false);
}

describe('normalizeNote', () => {
  it('leaves a valid note untouched (same object)', () => {
    const a = n('a', 60, 0, 480);
    expect(normalizeNote(a, LIMIT)).toBe(a);
  });

  it('clamps pitch and velocity, rounds to whole ticks, and floors the start at 0', () => {
    expect(normalizeNote(n('a', 200, -50, 100.4, 500), LIMIT)).toMatchObject({ pitch: 127, start: 0, duration: 100, velocity: 127 });
    expect(normalizeNote(n('a', -3, 10.6, 100, 0), LIMIT)).toMatchObject({ pitch: 0, start: 11, velocity: 1 });
  });

  it('never leaves a zero or negative length', () => {
    expect(normalizeNote(n('a', 60, 0, 0), LIMIT)!.duration).toBe(1);
    expect(normalizeNote(n('a', 60, 0, -40), LIMIT)!.duration).toBe(1);
    expect(normalizeNote(n('a', 60, 0, NaN), LIMIT)!.duration).toBe(1);
  });

  it('cuts a note at the limit and refuses one that starts at or after it', () => {
    expect(normalizeNote(n('a', 60, LIMIT - 100, 960), LIMIT)!.duration).toBe(100);
    expect(normalizeNote(n('a', 60, LIMIT, 960), LIMIT)).toBeNull();
    expect(normalizeNote(n('a', 60, LIMIT + 5, 960), LIMIT)).toBeNull();
  });
});

describe('overlap policy: trim, last edit wins', () => {
  const edit = (others: Note[], edited: Note[]) => sortNotes(resolveOverlaps(others, edited));
  const get = (notes: Note[], id: string) => notes.find((x) => x.id === id);

  it('a note on a different pitch is never touched', () => {
    const out = edit([n('o', 61, 0, 960)], [n('e', 60, 0, 960)]);
    expect(get(out, 'o')).toEqual(n('o', 61, 0, 960));
  });

  it('touching end to start is not an overlap', () => {
    const out = edit([n('o', 60, 0, 480)], [n('e', 60, 480, 480)]);
    expect(get(out, 'o')).toEqual(n('o', 60, 0, 480));
  });

  it('the earlier note is cut short where the edited note begins', () => {
    const out = edit([n('o', 60, 0, 960)], [n('e', 60, 480, 960)]);
    expect(get(out, 'o')).toMatchObject({ start: 0, duration: 480 });
    expect(get(out, 'e')).toMatchObject({ start: 480, duration: 960 });
  });

  it('a note swallowed by the edited one is removed', () => {
    const out = edit([n('o', 60, 480, 240)], [n('e', 60, 0, 960)]);
    expect(get(out, 'o')).toBeUndefined();
  });

  it('a note that starts inside and ends after has its start moved to the edited note end', () => {
    const out = edit([n('o', 60, 480, 960)], [n('e', 60, 0, 720)]);
    expect(get(out, 'o')).toMatchObject({ start: 720, duration: 720 });
  });

  it('an edited note dropped inside a longer one cuts that one at its start (the tail is dropped)', () => {
    const out = edit([n('o', 60, 0, 1920)], [n('e', 60, 480, 240)]);
    expect(get(out, 'o')).toMatchObject({ start: 0, duration: 480 });
  });

  it('an identical note on the same spot replaces the old one', () => {
    const out = edit([n('o', 60, 480, 480)], [n('e', 60, 480, 480)]);
    expect(out.map((x) => x.id)).toEqual(['e']);
  });

  it('edited notes that overlap each other: the later start wins, equal start: the later in the list', () => {
    const out = edit([], [n('e1', 60, 0, 960), n('e2', 60, 480, 960)]);
    expect(get(out, 'e1')).toMatchObject({ duration: 480 });
    const same = edit([], [n('e1', 60, 0, 960), n('e2', 60, 0, 240)]);
    expect(same.map((x) => x.id)).toEqual(['e2']);
  });

  it('many edited notes over one long note cut it once and keep the invariant', () => {
    const out = edit([n('o', 60, 0, 4000)], [n('e1', 60, 480, 240), n('e2', 60, 960, 240), n('e3', 60, 1440, 240)]);
    expect(get(out, 'o')).toMatchObject({ start: 0, duration: 480 });
    expectValid(out);
  });

  it('a note trimmed at its head can then be hit by the next edited note too', () => {
    const out = edit([n('o', 60, 100, 2000)], [n('e1', 60, 0, 500), n('e2', 60, 800, 500)]);
    expect(get(out, 'o')).toMatchObject({ start: 500, duration: 300 });
    expectValid(out);
  });

  it('randomised edits always leave a valid, overlap-free track', () => {
    let seed = 12345;
    const rnd = (k: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % k;
    };
    let notes: Note[] = [];
    for (let i = 0; i < 400; i++) {
      const upsert = Array.from({ length: 1 + rnd(3) }, (_, _j) => n(`n${rnd(60)}`, 60 + rnd(3), rnd(LIMIT + 500) - 200, rnd(2000) - 100, rnd(200) - 20));
      // Duplicate ids inside one edit are a caller bug; keep the last.
      const unique = [...new Map(upsert.map((u) => [u.id, u])).values()];
      notes = applyEdit(notes, { upsert: unique, remove: rnd(4) === 0 ? [`n${rnd(60)}`] : [], limit: LIMIT });
      expectValid(notes, LIMIT);
    }
  });
});

describe('applyEdit', () => {
  it('removes, replaces by id, and keeps notes sorted', () => {
    const all = [n('a', 60, 960, 480), n('b', 62, 0, 480), n('c', 64, 480, 480)];
    const out = applyEdit(all, { remove: ['b'], upsert: [n('a', 60, 0, 240)], limit: LIMIT });
    expect(out.map((x) => x.id)).toEqual(['a', 'c']);
    expect(out[0]).toMatchObject({ start: 0, duration: 240 });
  });

  it('leaves notes the edit does not touch exactly as they were, even past the limit', () => {
    const far = n('far', 60, LIMIT + 960, 480);
    const out = applyEdit([far], { upsert: [n('x', 61, 0, 100)], limit: LIMIT });
    expect(out.find((x) => x.id === 'far')).toBe(far);
  });

  it('drops an upserted note that cannot fit', () => {
    expect(applyEdit([], { upsert: [n('x', 60, LIMIT, 100)], limit: LIMIT })).toEqual([]);
  });

  it('editLimit grows to the end of any touched note that already ran past the song', () => {
    expect(editLimit(1000, [n('a', 60, 900, 300)])).toBe(1200);
    expect(editLimit(1000, [n('a', 60, 0, 300)])).toBe(1000);
  });
});

describe('diffs', () => {
  const before = [n('a', 60, 0, 480), n('b', 62, 480, 480), n('c', 64, 960, 480)];

  it('no change is null, and equal copies are no change', () => {
    expect(diffNotes(before, before)).toBeNull();
    expect(diffNotes(before, before.map((x) => ({ ...x })))).toBeNull();
  });

  it('records removed, changed and added notes', () => {
    const after = [n('a', 60, 0, 240), n('c', 64, 960, 480), n('d', 65, 0, 480)];
    const d = diffNotes(before, after)!;
    expect(d.removed.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(d.added.map((x) => x.id).sort()).toEqual(['a', 'd']);
  });

  it('apply then invert restores the original notes exactly, in order', () => {
    const after = applyEdit(before, { upsert: [n('a', 62, 400, 600)], remove: ['c'], limit: LIMIT });
    const d = diffNotes(before, after)!;
    expect(applyDiff(before, d)).toEqual(after);
    expect(applyDiff(after, invertDiff(d))).toEqual(before);
  });
});
