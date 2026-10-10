/**
 * Note layout and culling for the piano roll (plan T5.3a). Only notes that intersect the visible
 * window are turned into rectangles, found by binary search, so 5,000+ notes cost the same per frame
 * as the handful on screen.
 */
import type { Note } from '../contracts/project';
import { pitchToY, tickToX, visibleRange, type Size, type Viewport } from './viewport';

export interface NoteRect {
  id: string;
  pitch: number;
  velocity: number;
  /** Grid-area pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Narrowest a note is drawn, so a very short note stays visible when zoomed out. */
export const MIN_NOTE_WIDTH = 2;
/** Gap left between vertically adjacent notes, in pixels. */
export const NOTE_GAP = 1;

/** Notes sorted by start with a running maximum of their ends, which makes range queries O(log n + k). */
export interface NoteIndex {
  readonly sorted: readonly Note[];
  /** maxEnd[i] = largest end tick among sorted[0..i]; non-decreasing. */
  readonly maxEnd: readonly number[];
  /** Largest end tick of any note (0 when empty). */
  readonly farthestEnd: number;
}

export function buildNoteIndex(notes: readonly Note[]): NoteIndex {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const maxEnd: number[] = new Array<number>(sorted.length);
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = Math.max(run, sorted[i]!.start + sorted[i]!.duration);
    maxEnd[i] = run;
  }
  return { sorted, maxEnd, farthestEnd: run };
}

const indexCache = new WeakMap<readonly Note[], NoteIndex>();

/** Index for a notes array, rebuilt only when the array is replaced (project edits never mutate in place). */
export function indexFor(notes: readonly Note[]): NoteIndex {
  let idx = indexCache.get(notes);
  if (!idx) indexCache.set(notes, (idx = buildNoteIndex(notes)));
  return idx;
}

/** Notes overlapping [tickFrom, tickTo) in time and within [pitchLo, pitchHi]. Order: by start, then pitch. */
export function queryNotes(index: NoteIndex, tickFrom: number, tickTo: number, pitchLo: number, pitchHi: number): Note[] {
  const { sorted, maxEnd } = index;
  // First position whose running max end passes tickFrom: nothing before it can still be sounding at tickFrom.
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (maxEnd[mid]! > tickFrom) hi = mid;
    else lo = mid + 1;
  }
  const out: Note[] = [];
  for (let i = lo; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (n.start >= tickTo) break;
    if (n.start + n.duration > tickFrom && n.pitch >= pitchLo && n.pitch <= pitchHi) out.push(n);
  }
  return out;
}

export function noteRect(n: Pick<Note, 'id' | 'pitch' | 'velocity' | 'start' | 'duration'>, vp: Viewport): NoteRect {
  return {
    id: n.id,
    pitch: n.pitch,
    velocity: n.velocity,
    x: tickToX(vp, n.start),
    y: pitchToY(vp, n.pitch) + NOTE_GAP / 2,
    w: Math.max(MIN_NOTE_WIDTH, n.duration * vp.pxPerTick - NOTE_GAP),
    h: Math.max(2, vp.rowHeight - NOTE_GAP),
  };
}

/** Rectangles for the notes that are on screen. */
export function layoutVisibleNotes(index: NoteIndex, vp: Viewport, size: Size): NoteRect[] {
  const r = visibleRange(vp, size);
  return queryNotes(index, r.tickFrom, r.tickTo, r.pitchLo, r.pitchHi).map((n) => noteRect(n, vp));
}

/** Opacity for a note's fill: soft notes are pale, hard notes solid, never invisible. 1 → 0.3, 127 → 1. */
export function velocityOpacity(velocity: number): number {
  const v = Math.min(127, Math.max(1, velocity));
  return 0.3 + 0.7 * ((v - 1) / 126);
}
