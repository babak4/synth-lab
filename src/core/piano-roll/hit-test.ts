/**
 * Hit-testing for the piano roll (plan T5.3b): which note is under the pointer, and is the pointer on
 * its body (move) or on its right-edge handle (resize)? Pure; works on grid-area pixels.
 *
 * The row is matched exactly (including the 1 px gap between rows, so notes are easy to hit), and the
 * x range is the drawn rectangle widened by HIT_TOLERANCE_PX, so a note a few pixels wide is still
 * grabbable and the resize handle can be caught just outside the edge.
 */
import type { Note } from '../contracts/project';
import { noteRect, queryNotes, type NoteIndex } from './notes';
import { xToTick, yToPitch, type Viewport } from './viewport';

/** Width of the resize handle at the right edge of a wide note. */
export const RESIZE_HANDLE_PX = 8;
/** Narrowest the handle gets on a narrow note, so a body remains to grab. */
export const RESIZE_HANDLE_MIN_PX = 3;
/** How far outside a note's rectangle still counts as on it. */
export const HIT_TOLERANCE_PX = 3;

export type HitZone = 'body' | 'resize';
export interface NoteHit {
  note: Note;
  zone: HitZone;
}

/** Pixel width of the resize handle for a note drawn `w` px wide: a third of it, between 3 and 8 px. */
export function handleWidth(w: number): number {
  return Math.min(RESIZE_HANDLE_PX, Math.max(RESIZE_HANDLE_MIN_PX, w / 3));
}

export function hitTest(index: NoteIndex, vp: Viewport, x: number, y: number): NoteHit | null {
  if (!(x >= 0) || !(y >= 0)) return null;
  const pitch = yToPitch(vp, y);
  const tick = xToTick(vp, x);
  const tol = HIT_TOLERANCE_PX / vp.pxPerTick;
  let best: { note: Note; dist: number; rx: number; rw: number } | null = null;
  for (const n of queryNotes(index, tick - tol, tick + tol, pitch, pitch)) {
    const r = noteRect(n, vp);
    const dist = x < r.x ? r.x - x : x > r.x + r.w ? x - (r.x + r.w) : 0;
    if (dist > HIT_TOLERANCE_PX) continue;
    // Closest rectangle wins; between equals, the later note (the one drawn on top).
    if (!best || dist < best.dist || (dist === best.dist && n.start >= best.note.start)) best = { note: n, dist, rx: r.x, rw: r.w };
  }
  if (!best) return null;
  const onHandle = x >= best.rx + best.rw - handleWidth(best.rw);
  return { note: best.note, zone: onHandle ? 'resize' : 'body' };
}
