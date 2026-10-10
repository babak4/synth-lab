import { describe, expect, it } from 'vitest';
import type { Note } from '../contracts/project';
import {
  addNote,
  clampPitchDelta,
  clampTimeDelta,
  deleteNotes,
  duplicateNotes,
  makeClip,
  nudgeNotes,
  pasteClip,
  transposeNotes,
} from './edit-ops';

const n = (id: string, pitch: number, start: number, duration: number): Note => ({ id, pitch, start, duration, velocity: 90 });
const SONG = 3840 * 2;
const ids = () => {
  let i = 0;
  return () => `new${++i}`;
};

describe('clamping a group', () => {
  const group = [n('a', 10, 100, 200), n('b', 120, 400, 500)];
  it('pitch: the group stops when its top or bottom note reaches the edge', () => {
    expect(clampPitchDelta(group, 5)).toBe(5);
    expect(clampPitchDelta(group, 12)).toBe(7);
    expect(clampPitchDelta(group, -12)).toBe(-10);
    expect(clampPitchDelta([], 3)).toBe(0);
  });
  it('time: never before 0, never past the limit', () => {
    expect(clampTimeDelta(group, -1000, 2000)).toBe(-100);
    expect(clampTimeDelta(group, 5000, 2000)).toBe(1100);
    expect(clampTimeDelta(group, 50, 2000)).toBe(50);
    expect(clampTimeDelta(group, 50, 300)).toBe(0); // already past this limit: only moves earlier
  });
});

describe('addNote', () => {
  it('adds, and trims what it lands on', () => {
    const out = addNote([n('x', 60, 0, 960)], n('new', 60, 480, 480), SONG)!;
    expect(out.created).toEqual(['new']);
    expect(out.notes.find((q) => q.id === 'x')!.duration).toBe(480);
  });
  it('is refused past the end of the song', () => {
    expect(addNote([], n('new', 60, SONG, 480), SONG)).toBeNull();
  });
  it('is cut at the end of the song', () => {
    expect(addNote([], n('new', 60, SONG - 100, 480), SONG)!.notes[0]!.duration).toBe(100);
  });
});

describe('deleteNotes', () => {
  it('removes the named notes and reports nothing to do for unknown ids', () => {
    const all = [n('a', 60, 0, 100), n('b', 62, 0, 100)];
    expect(deleteNotes(all, ['a'])!.map((q) => q.id)).toEqual(['b']);
    expect(deleteNotes(all, ['zzz'])).toBeNull();
    expect(deleteNotes(all, [])).toBeNull();
  });
});

describe('transposeNotes', () => {
  const all = [n('a', 60, 0, 480), n('b', 64, 480, 480), n('c', 70, 0, 480)];
  it('moves the selection by semitones and leaves the rest', () => {
    const out = transposeNotes(all, ['a', 'b'], 1, SONG)!;
    expect(out.delta).toBe(1);
    expect(out.notes.map((q) => [q.id, q.pitch])).toEqual([['a', 61], ['c', 70], ['b', 65]]);
  });
  it('by an octave', () => {
    expect(transposeNotes(all, ['a'], -12, SONG)!.notes.find((q) => q.id === 'a')!.pitch).toBe(48);
  });
  it('stops at the top of the keyboard, together, and does nothing when already there', () => {
    const top = [n('a', 127, 0, 100), n('b', 120, 0, 100)];
    expect(transposeNotes(top, ['a', 'b'], 1, SONG)).toBeNull();
    expect(transposeNotes([n('a', 125, 0, 100), n('b', 120, 0, 100)], ['a', 'b'], 12, SONG)!.delta).toBe(2);
  });
  it('trims a same-pitch note it lands on', () => {
    const out = transposeNotes([n('a', 60, 0, 480), n('x', 61, 240, 480)], ['a'], 1, SONG)!;
    // x started inside a's new span and ended after it: its start moves to where a ends.
    expect(out.notes.find((q) => q.id === 'x')).toMatchObject({ start: 480, duration: 240 });
    expect(out.notes.find((q) => q.id === 'a')).toMatchObject({ pitch: 61, start: 0, duration: 480 });
  });
  it('does nothing without a selection', () => {
    expect(transposeNotes(all, [], 1, SONG)).toBeNull();
  });
});

describe('nudgeNotes', () => {
  const all = [n('a', 60, 240, 480), n('b', 64, 960, 480)];
  it('shifts the selection in time', () => {
    const out = nudgeNotes(all, ['a', 'b'], 240, SONG)!;
    expect(out.notes.map((q) => q.start)).toEqual([480, 1200]);
  });
  it('stops at tick 0 as a group, and does nothing when already there', () => {
    const out = nudgeNotes(all, ['a', 'b'], -1000, SONG)!;
    expect(out.delta).toBe(-240);
    expect(out.notes.map((q) => q.start)).toEqual([0, 720]);
    expect(nudgeNotes([n('a', 60, 0, 10)], ['a'], -240, SONG)).toBeNull();
  });
  it('stops at the end of the song', () => {
    const out = nudgeNotes([n('a', 60, SONG - 300, 200)], ['a'], 960, SONG)!;
    expect(out.notes[0]).toMatchObject({ start: SONG - 200, duration: 200 });
    expect(nudgeNotes([n('a', 60, SONG - 200, 200)], ['a'], 960, SONG)).toBeNull();
  });
  it('a note that already runs past the song can still move earlier but not later', () => {
    const long = [n('a', 60, SONG - 100, 400)];
    expect(nudgeNotes(long, ['a'], 240, SONG)).toBeNull();
    expect(nudgeNotes(long, ['a'], -240, SONG)!.notes[0]!.start).toBe(SONG - 340);
  });
});

describe('clipboard', () => {
  const all = [n('a', 60, 960, 480), n('b', 64, 1200, 960), n('z', 70, 5000, 100)];

  it('a clip is position independent: offsets from the earliest start', () => {
    const clip = makeClip(all.slice(0, 2))!;
    expect(clip.notes).toEqual([
      { pitch: 60, offset: 0, duration: 480, velocity: 90 },
      { pitch: 64, offset: 240, duration: 960, velocity: 90 },
    ]);
    expect(clip.span).toBe(1200);
    expect(makeClip([])).toBeNull();
  });

  it('paste puts fresh notes at the playhead and reports their ids', () => {
    const clip = makeClip(all.slice(0, 2))!;
    const out = pasteClip([], clip, 3840, SONG, ids())!;
    expect(out.created).toEqual(['new1', 'new2']);
    expect(out.notes.map((q) => [q.pitch, q.start, q.duration])).toEqual([[60, 3840, 480], [64, 4080, 960]]);
  });

  it('paste clips to the end of the song and drops what does not start inside it', () => {
    const clip = makeClip(all.slice(0, 2))!;
    const out = pasteClip([], clip, SONG - 300, SONG, ids())!;
    expect(out.notes).toHaveLength(2);
    expect(out.notes.every((q) => q.start + q.duration <= SONG)).toBe(true);
    const late = pasteClip([], clip, SONG - 100, SONG, ids())!;
    expect(late.created).toEqual(['new1']); // the second note would start after the end
    expect(pasteClip([], clip, SONG, SONG, ids())).toBeNull();
  });

  it('paste onto existing notes trims them (same policy as every edit)', () => {
    const clip = makeClip([n('a', 60, 0, 480)])!;
    const out = pasteClip([n('x', 60, 0, 960)], clip, 480, SONG, ids())!;
    expect(out.notes.find((q) => q.id === 'x')!.duration).toBe(480);
  });

  it('duplicate places copies right after the selection and selects them', () => {
    const out = duplicateNotes(all, ['a', 'b'], SONG, ids())!;
    expect(out.created).toHaveLength(2);
    const copies = out.notes.filter((q) => out.created.includes(q.id));
    expect(copies.map((q) => [q.pitch, q.start, q.duration])).toEqual([[60, 2160, 480], [64, 2400, 960]]);
    expect(out.notes).toHaveLength(5);
  });

  it('duplicate with no room, or no selection, does nothing', () => {
    expect(duplicateNotes([n('a', 60, SONG - 100, 100)], ['a'], SONG, ids())).toBeNull();
    expect(duplicateNotes(all, [], SONG, ids())).toBeNull();
  });
});
