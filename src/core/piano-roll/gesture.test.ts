import { describe, expect, it } from 'vitest';
import type { Note } from '../contracts/project';
import {
  DRAG_THRESHOLD_PX,
  clickDuration,
  dragged,
  drawStart,
  drawnDuration,
  makeBox,
  moveDeltas,
  movedNotes,
  notesInBox,
  resizeDelta,
  resizedNotes,
  rowAt,
  type MoveStart,
  type ResizeStart,
} from './gesture';

const n = (id: string, pitch: number, start: number, duration: number): Note => ({ id, pitch, start, duration, velocity: 100 });
const LIMIT = 7680;

describe('drag threshold', () => {
  it('a press that barely moves is still a click', () => {
    expect(dragged(1, 1)).toBe(false);
    expect(dragged(DRAG_THRESHOLD_PX, 0)).toBe(true);
    expect(dragged(0, -4)).toBe(true);
  });
});

describe('moveDeltas', () => {
  const a = n('a', 60, 960, 480);
  const b = n('b', 64, 1500, 480); // off the grid
  const g: MoveStart = { originals: [a, b], anchor: a, grabTick: 1000, grabPitch: 60, limit: LIMIT };

  it('lands the grabbed note start on the grid; the others keep their distance from it', () => {
    const d = moveDeltas(g, 1000 + 500, 62, 240);
    expect(d).toEqual({ dTick: 480, dPitch: 2 });
    const out = movedNotes(g, d);
    expect(out.map((q) => q.start)).toEqual([1440, 1980]);
    expect(out.map((q) => q.pitch)).toEqual([62, 66]);
  });

  it('snaps to the nearest line, not just downwards', () => {
    expect(moveDeltas(g, 1000 + 130, 60, 240).dTick).toBe(240);
    expect(moveDeltas(g, 1000 + 110, 60, 240).dTick).toBe(0);
  });

  it('with snap off (Alt) it moves by whole ticks', () => {
    expect(moveDeltas(g, 1000 + 37.4, 60, null).dTick).toBe(37);
  });

  it('is clamped as a group: never before tick 0, never past the limit', () => {
    expect(moveDeltas(g, 1000 - 5000, 60, 240).dTick).toBe(-960);
    expect(moveDeltas(g, 1000 + 99999, 60, 240).dTick).toBe(LIMIT - 1980);
  });

  it('pitch is clamped as a group to 0–127', () => {
    expect(moveDeltas(g, 1000, 200, 240).dPitch).toBe(127 - 64);
    expect(moveDeltas(g, 1000, -50, 240).dPitch).toBe(-60);
  });

  it('a drag that returns to where it started is no move at all', () => {
    expect(moveDeltas(g, 1000, 60, 240)).toEqual({ dTick: 0, dPitch: 0 });
  });
});

describe('resizeDelta', () => {
  const a = n('a', 60, 960, 480); // ends 1440
  const g: ResizeStart = { originals: [a], anchor: a, grabTick: 1438, limit: LIMIT };

  it('lands the end on the grid', () => {
    expect(resizeDelta(g, 1438 + 500, 240)).toBe(480); // end → 1920
    expect(resizedNotes(g, 480)[0]!.duration).toBe(960);
  });

  it('can shrink, but never below one snap step', () => {
    expect(resizeDelta(g, 1438 - 250, 240)).toBe(-240); // end → 1200 (a duration of 240)
    expect(resizeDelta(g, 0, 240)).toBe(-240); // would be negative: stops at one step
  });

  it('with snap off the floor is one tick, never zero or negative', () => {
    const d = resizeDelta(g, -9999, null);
    expect(a.duration + d).toBe(1);
  });

  it('a note already shorter than the step cannot shrink further, only grow', () => {
    const short = n('s', 60, 0, 100);
    const gs: ResizeStart = { originals: [short], anchor: short, grabTick: 100, limit: LIMIT };
    expect(resizeDelta(gs, 0, 240)).toBe(0);
    expect(resizeDelta(gs, 400, 240)).toBe(380); // end → 480
  });

  it('never grows past the limit', () => {
    expect(resizeDelta(g, 99999, 240)).toBe(LIMIT - 1440);
  });

  it('every selected note gets the same change, limited by the most restrictive', () => {
    const b = n('b', 64, 0, 300);
    const multi: ResizeStart = { originals: [a, b], anchor: a, grabTick: 1438, limit: LIMIT };
    // b is longer than... shrinking 480 → 240 would take b (300) to 60: below the step, so b blocks the shrink to -240+... max(lo)
    expect(resizeDelta(multi, 1438 - 240, 240)).toBe(-60);
    expect(resizedNotes(multi, 100).map((q) => q.duration)).toEqual([580, 400]);
  });
});

describe('drawing', () => {
  it('starts in the cell the press is in', () => {
    expect(drawStart(479, 240)).toBe(240);
    expect(drawStart(481, 240)).toBe(480);
    expect(drawStart(100.4, null)).toBe(100);
  });

  it('length follows the pointer on the grid, at least one step', () => {
    expect(drawnDuration(480, 1000, 240, LIMIT)).toBe(480); // end → 960
    expect(drawnDuration(480, 500, 240, LIMIT)).toBe(240);
    expect(drawnDuration(480, 100, 240, LIMIT)).toBe(240); // dragged backwards
    expect(drawnDuration(480, 100, null, LIMIT)).toBe(1);
    expect(drawnDuration(480, 481, null, LIMIT)).toBe(1);
  });

  it('never runs past the end of the song', () => {
    expect(drawnDuration(LIMIT - 480, 99999, 240, LIMIT)).toBe(480);
    expect(drawnDuration(LIMIT - 100, 99999, 240, LIMIT)).toBe(100);
  });

  it('a click takes the current length, trimmed to the room left', () => {
    expect(clickDuration(0, 960, LIMIT)).toBe(960);
    expect(clickDuration(LIMIT - 100, 960, LIMIT)).toBe(100);
    expect(clickDuration(LIMIT, 960, LIMIT)).toBe(0);
  });
});

describe('box selection', () => {
  const notes = [n('a', 60, 0, 480), n('b', 62, 480, 480), n('c', 70, 0, 480)];

  it('the box takes corners in any order', () => {
    expect(makeBox(500, 63, 100, 59.5)).toEqual({ tick0: 100, tick1: 500, pitch0: 59.5, pitch1: 63 });
  });

  it('selects notes the box touches, in time and in pitch rows', () => {
    const ids = (b: ReturnType<typeof makeBox>) => notesInBox(notes, b).map((q) => q.id);
    expect(ids(makeBox(100, 60.2, 300, 60.8))).toEqual(['a']);
    expect(ids(makeBox(0, 59, 1000, 64))).toEqual(['a', 'b']);
    expect(ids(makeBox(500, 61, 800, 62.1))).toEqual(['b']);
    expect(ids(makeBox(2000, 0, 3000, 127))).toEqual([]);
    expect(ids(makeBox(480, 60, 481, 61))).toEqual([]); // a ends exactly at 480; b sits on another row
  });

  it('touching only an edge does not select', () => {
    expect(notesInBox(notes, makeBox(480, 60, 600, 61))).toEqual([]);
  });

  it('rowAt maps pixels to fractional pitch rows (the top of the keyboard is 128)', () => {
    expect(rowAt(0, 0, 16)).toBe(128);
    expect(rowAt(16, 0, 16)).toBe(127);
    expect(rowAt(8, 16, 16)).toBe(126.5);
  });
});
