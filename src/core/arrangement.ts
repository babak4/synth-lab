/**
 * Arrangement overview maths (plan T5.6): miniature note layout and track-row ordering.
 * Pure, so the UI only draws the numbers.
 */
import { MAX_TRACKS, type Note } from './contracts/project';

export interface MiniNote {
  /** Fractions of the lane: x and width along the project length, y from the top, h of the lane. */
  x: number;
  w: number;
  y: number;
  h: number;
}

/** Smallest pitch span a lane is scaled to, so a single note is not stretched over the whole lane. */
export const MIN_PITCH_SPAN = 12;
/** Narrowest a mini note is drawn, as a fraction of the lane, so very short notes stay visible. */
export const MIN_MINI_WIDTH = 0.002;

/**
 * Lay a track's notes out in a lane covering `totalTicks`. Notes beyond the project end are clipped;
 * pitch is scaled to the track's own range (higher notes nearer the top).
 */
export function layoutMiniNotes(notes: readonly Note[], totalTicks: number): MiniNote[] {
  if (notes.length === 0 || totalTicks <= 0) return [];
  let lo = 127;
  let hi = 0;
  for (const n of notes) {
    lo = Math.min(lo, n.pitch);
    hi = Math.max(hi, n.pitch);
  }
  const span = Math.max(MIN_PITCH_SPAN, hi - lo + 1);
  // Centre the range in the lane when it is narrower than the minimum span.
  const base = lo - (span - (hi - lo + 1)) / 2;
  const h = 1 / span;
  const out: MiniNote[] = [];
  for (const n of notes) {
    if (n.start >= totalTicks) continue;
    const end = Math.min(totalTicks, n.start + n.duration);
    const x = n.start / totalTicks;
    const w = Math.min(1 - x, Math.max(MIN_MINI_WIDTH, (end - n.start) / totalTicks));
    out.push({ x, w, y: 1 - (n.pitch - base + 1) / span, h });
  }
  return out;
}

/** Fractions (0–1) of the lane at which bar lines fall, excluding the start. */
export function barLines(lengthBars: number): number[] {
  return Array.from({ length: Math.max(0, lengthBars - 1) }, (_, i) => (i + 1) / lengthBars);
}

/** Index a track moves to when nudged one place up (-1) or down (+1), or null at the ends of the list. */
export function nudgeIndex(index: number, direction: -1 | 1, count: number): number | null {
  const to = index + direction;
  return index < 0 || index >= count || to < 0 || to >= count ? null : to;
}

export const canAddTrack = (count: number): boolean => count < MAX_TRACKS;

export const ADD_DISABLED_REASON = `A project holds at most ${MAX_TRACKS} tracks. Delete a track to add another.`;
