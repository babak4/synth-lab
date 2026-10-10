/**
 * The piano roll's edits as pure functions from "a track's notes" to "the track's notes after" (plan
 * T5.3b). Every one goes through `applyEdit`, so every one obeys the same rules: notes stay valid,
 * stay inside the song, and same-pitch overlaps are trimmed (see overlap.ts). A function that cannot do
 * anything returns null and the caller reports why; nothing here throws.
 */
import type { Note } from '../contracts/project';
import { PITCH_HIGH, PITCH_LOW, applyEdit, editLimit, noteEnd } from './overlap';

export type MakeId = () => string;

export interface EditOutcome {
  notes: Note[];
  /** Ids of notes the edit created (they become the selection). */
  created: string[];
}

const byIds = (all: readonly Note[], ids: Iterable<string>): Note[] => {
  const set = new Set(ids);
  return all.filter((n) => set.has(n.id));
};

// ---- clamping a group move -----------------------------------------------------------------

/** Largest shift in pitch that keeps every note in 0–127, nearest to `semitones`. */
export function clampPitchDelta(notes: readonly Note[], semitones: number): number {
  if (notes.length === 0) return 0;
  let lo = PITCH_HIGH;
  let hi = PITCH_LOW;
  for (const n of notes) {
    lo = Math.min(lo, n.pitch);
    hi = Math.max(hi, n.pitch);
  }
  return Math.min(PITCH_HIGH - hi, Math.max(PITCH_LOW - lo, Math.round(semitones)));
}

/** Largest shift in time that keeps every note between tick 0 and `limit`, nearest to `ticks`. */
export function clampTimeDelta(notes: readonly Note[], ticks: number, limit: number): number {
  if (notes.length === 0) return 0;
  let first = Infinity;
  let last = 0;
  for (const n of notes) {
    first = Math.min(first, n.start);
    last = Math.max(last, noteEnd(n));
  }
  const lo = -first;
  const hi = Math.max(0, limit - last);
  return Math.min(hi, Math.max(lo, Math.round(ticks)));
}

/** The notes, shifted. Deltas are used as given; clamp them first. */
export const shifted = (notes: readonly Note[], dTick: number, dPitch: number): Note[] =>
  notes.map((n) => ({ ...n, start: n.start + dTick, pitch: n.pitch + dPitch }));

// ---- edits ---------------------------------------------------------------------------------

export function addNote(all: readonly Note[], note: Note, songTicks: number): EditOutcome | null {
  const notes = applyEdit(all, { upsert: [note], limit: songTicks });
  return notes.some((n) => n.id === note.id) ? { notes, created: [note.id] } : null;
}

export function deleteNotes(all: readonly Note[], ids: Iterable<string>): Note[] | null {
  const gone = new Set(ids);
  if (!all.some((n) => gone.has(n.id))) return null;
  return applyEdit(all, { remove: gone, limit: Infinity });
}

/** Move the selected notes by semitones, as a group: when one hits the top or bottom of the keyboard they all stop. */
export function transposeNotes(all: readonly Note[], ids: Iterable<string>, semitones: number, songTicks: number): { notes: Note[]; delta: number } | null {
  const sel = byIds(all, ids);
  const delta = clampPitchDelta(sel, semitones);
  if (sel.length === 0 || delta === 0) return null;
  return { notes: applyEdit(all, { upsert: shifted(sel, 0, delta), limit: editLimit(songTicks, sel) }), delta };
}

/** Move the selected notes in time, as a group, never before tick 0 or past the end. */
export function nudgeNotes(all: readonly Note[], ids: Iterable<string>, ticks: number, songTicks: number): { notes: Note[]; delta: number } | null {
  const sel = byIds(all, ids);
  const limit = editLimit(songTicks, sel);
  const delta = clampTimeDelta(sel, ticks, limit);
  if (sel.length === 0 || delta === 0) return null;
  return { notes: applyEdit(all, { upsert: shifted(sel, delta, 0), limit }), delta };
}

// ---- clipboard -----------------------------------------------------------------------------

export interface ClipNote {
  pitch: number;
  /** Ticks after the earliest copied note's start. */
  offset: number;
  duration: number;
  velocity: number;
}

export interface Clip {
  notes: ClipNote[];
  /** From the earliest start to the latest end. */
  span: number;
}

/** Copy notes into a position-independent clip. Null when there is nothing to copy. */
export function makeClip(notes: readonly Note[]): Clip | null {
  if (notes.length === 0) return null;
  let first = Infinity;
  let last = 0;
  for (const n of notes) {
    first = Math.min(first, n.start);
    last = Math.max(last, noteEnd(n));
  }
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return {
    notes: sorted.map((n) => ({ pitch: n.pitch, offset: n.start - first, duration: n.duration, velocity: n.velocity })),
    span: last - first,
  };
}

/**
 * Put a clip's notes in at `atTick`, as new notes. Whatever sticks out past the end of the song is
 * clipped or left out. Null when none of it fits.
 */
export function pasteClip(all: readonly Note[], clip: Clip, atTick: number, songTicks: number, makeId: MakeId): EditOutcome | null {
  const start = Math.max(0, Math.round(atTick));
  const fresh: Note[] = clip.notes.map((c) => ({ id: makeId(), pitch: c.pitch, start: start + c.offset, duration: c.duration, velocity: c.velocity }));
  const notes = applyEdit(all, { upsert: fresh, limit: songTicks });
  const kept = new Set(notes.map((n) => n.id));
  const created = fresh.filter((n) => kept.has(n.id)).map((n) => n.id);
  return created.length === 0 ? null : { notes, created };
}

/** Copy the selection to just after itself (one selection-length later); the copies become the selection. */
export function duplicateNotes(all: readonly Note[], ids: Iterable<string>, songTicks: number, makeId: MakeId): EditOutcome | null {
  const sel = byIds(all, ids);
  const clip = makeClip(sel);
  if (!clip) return null;
  const first = Math.min(...sel.map((n) => n.start));
  return pasteClip(all, clip, first + clip.span, songTicks, makeId);
}
