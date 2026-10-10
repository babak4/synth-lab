/**
 * Drag maths for the piano roll (plan T5.3b): moving, resizing, drawing and box-selecting. Pure and
 * stateless; the edit store keeps the gesture's starting data and calls these on every pointer move.
 *
 * Positions arrive as ticks and pitches already converted from pixels. `step` is the snap step in ticks
 * for this gesture, or null for free placement (snap off, or Alt held).
 */
import type { Note } from '../contracts/project';
import { clampPitchDelta, clampTimeDelta, shifted } from './edit-ops';
import { noteEnd } from './overlap';
import { snapFloor, snapRound } from './snap';
import { PITCH_MAX } from './viewport';

/** Pointer travel (pixels) before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 3;

export const dragged = (dxPx: number, dyPx: number): boolean => Math.hypot(dxPx, dyPx) >= DRAG_THRESHOLD_PX;

// ---- move ----------------------------------------------------------------------------------

export interface MoveStart {
  /** The notes being moved (all selected notes). */
  originals: readonly Note[];
  /** The note under the pointer: it is the one that lands on the grid. */
  anchor: Note;
  /** Where the pointer was when the drag began. */
  grabTick: number;
  grabPitch: number;
  /** Notes may not end after this. */
  limit: number;
}

/**
 * Shifts for a move drag. Time is snapped so the grabbed note's START lands on the grid (the others keep
 * their distance from it), then the whole group is clamped so nothing leaves 0…limit or 0–127.
 */
export function moveDeltas(g: MoveStart, tick: number, pitch: number, step: number | null): { dTick: number; dPitch: number } {
  const target = g.anchor.start + (tick - g.grabTick);
  const snapped = step === null ? Math.round(target) : snapRound(target, step);
  return {
    dTick: clampTimeDelta(g.originals, snapped - g.anchor.start, g.limit),
    dPitch: clampPitchDelta(g.originals, pitch - g.grabPitch),
  };
}

export const movedNotes = (g: MoveStart, d: { dTick: number; dPitch: number }): Note[] => shifted(g.originals, d.dTick, d.dPitch);

// ---- resize --------------------------------------------------------------------------------

export interface ResizeStart {
  originals: readonly Note[];
  anchor: Note;
  grabTick: number;
  limit: number;
}

/**
 * Change in length for a resize drag. The grabbed note's END lands on the grid; every selected note gets
 * the same change. No note shrinks below one grid step (or one tick with snap off), and a note that is
 * already shorter than that cannot shrink further, so a resize can never produce a zero-length note.
 */
export function resizeDelta(g: ResizeStart, tick: number, step: number | null): number {
  const target = noteEnd(g.anchor) + (tick - g.grabTick);
  const snapped = step === null ? Math.round(target) : snapRound(target, step);
  const minLen = step ?? 1;
  let lo = -Infinity;
  let hi = Infinity;
  for (const n of g.originals) {
    lo = Math.max(lo, Math.min(n.duration, minLen) - n.duration);
    hi = Math.min(hi, g.limit - noteEnd(n));
  }
  return Math.min(Math.max(0, hi), Math.max(lo, snapped - noteEnd(g.anchor)));
}

export const resizedNotes = (g: ResizeStart, delta: number): Note[] => g.originals.map((n) => ({ ...n, duration: n.duration + delta }));

// ---- draw ----------------------------------------------------------------------------------

/** Where a click-drag on empty grid starts: the cell the pointer went down in. */
export function drawStart(tick: number, step: number | null): number {
  return snapFloor(tick, step);
}

/**
 * Length drawn by dragging to `tick`: the end snaps to the grid, and the note is never shorter than one
 * step (one tick with snap off) or longer than the room before `limit`. Dragging left of the start
 * gives the minimum.
 */
export function drawnDuration(start: number, tick: number, step: number | null, limit: number): number {
  const end = step === null ? Math.round(tick) : snapRound(tick, step);
  const minLen = step ?? 1;
  return Math.max(1, Math.min(Math.max(minLen, end - start), limit - start));
}

/** Length of a plain click: the current note length, trimmed to the room before `limit`. */
export function clickDuration(start: number, length: number, limit: number): number {
  return Math.max(0, Math.min(length, limit - start));
}

// ---- box selection -------------------------------------------------------------------------

/** A selection rectangle in musical space: ticks, and pitch rows (a note at pitch p occupies [p, p+1)). */
export interface Box {
  tick0: number;
  tick1: number;
  pitch0: number;
  pitch1: number;
}

/** Box from two corners given as ticks and fractional pitch rows, corners in any order. */
export function makeBox(tickA: number, pitchA: number, tickB: number, pitchB: number): Box {
  return {
    tick0: Math.min(tickA, tickB),
    tick1: Math.max(tickA, tickB),
    pitch0: Math.min(pitchA, pitchB),
    pitch1: Math.max(pitchA, pitchB),
  };
}

/** Fractional pitch row under a y coordinate: pitch p covers [p, p+1). */
export const rowAt = (y: number, scrollY: number, rowHeight: number): number => PITCH_MAX + 1 - (y + scrollY) / rowHeight;

/** Notes the box touches. */
export function notesInBox(notes: readonly Note[], box: Box): Note[] {
  return notes.filter((n) => n.start < box.tick1 && noteEnd(n) > box.tick0 && n.pitch < box.pitch1 && n.pitch + 1 > box.pitch0);
}
