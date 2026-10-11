/**
 * Note validity and the same-pitch overlap policy (plan T5.3b). Pure.
 *
 * DECISION (overlap): TRIM, last edit wins. Two notes of the same pitch never overlap. When an edit
 * (add, move, resize, paste, duplicate, nudge, transpose) leaves an edited note on top of another note
 * of the same pitch, the OTHER note gives way:
 *   - it starts before the edited note  → it is cut short at the edited note's start (a tail that
 *     would stick out beyond the edited note is dropped);
 *   - it starts inside the edited note and ends inside it → it is removed;
 *   - it starts inside the edited note and ends after it → its start moves to the edited note's end.
 * Edited notes that overlap each other (resizing two neighbours together) resolve the same way, later
 * start winning. Why trim and not prevent: a gesture is never silently refused halfway (a drag that
 * stops responding looks like a bug), the result is always a valid state, what the preview shows is
 * exactly what is committed, and one undo step restores every trimmed note.
 *
 * DECISION (validity): every edited note is normalised: pitch is an integer 0–127, velocity an integer
 * 1–127, start ≥ 0, duration ≥ 1 tick, and the note ends no later than the edit's `limit`. A note that
 * would start at or after `limit` is dropped (an add/paste there is refused; a move is clamped by the
 * gesture before it gets here). `limit` is the song length, or farther when the notes being edited
 * already ran past it, so editing never drags an existing note back onto the song; only notes the user
 * touches are ever normalised.
 */
import type { Note } from '../contracts/project';

export const PITCH_LOW = 0;
export const PITCH_HIGH = 127;
export const VELOCITY_LOW = 1;
export const VELOCITY_HIGH = 127;
export const DEFAULT_VELOCITY = 100;

const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(v)));

export const noteEnd = (n: Pick<Note, 'start' | 'duration'>): number => n.start + n.duration;

/** A valid copy of `n` that ends by `limit`, or null when no valid note fits (it would start at/after `limit`). */
export function normalizeNote(n: Note, limit: number): Note | null {
  const start = Math.max(0, Math.round(Number.isFinite(n.start) ? n.start : 0));
  if (start >= limit) return null;
  const wanted = Math.max(1, Math.round(Number.isFinite(n.duration) ? n.duration : 1));
  const duration = Math.min(wanted, limit - start);
  const pitch = clampInt(n.pitch, PITCH_LOW, PITCH_HIGH);
  const velocity = clampInt(n.velocity, VELOCITY_LOW, VELOCITY_HIGH);
  if (start === n.start && duration === n.duration && pitch === n.pitch && velocity === n.velocity) return n;
  return { ...n, start, duration, pitch, velocity };
}

/** Canonical order: by start, then pitch, then id. Edits keep notes in this order so undo restores it exactly. */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const overlaps = (a: Note, b: Note): boolean => a.start < noteEnd(b) && b.start < noteEnd(a);

/** Make the edited notes (already normalised) disjoint per pitch; later start wins, equal starts: later in the list wins. */
function settleEdited(edited: readonly Note[]): Note[] {
  const byPitch = new Map<number, Note[]>();
  for (const n of edited) {
    const list = byPitch.get(n.pitch);
    if (list) list.push(n);
    else byPitch.set(n.pitch, [n]);
  }
  const out: Note[] = [];
  for (const list of byPitch.values()) {
    const sorted = list.map((n, i) => ({ n, i })).sort((a, b) => a.n.start - b.n.start || a.i - b.i);
    const kept: Note[] = [];
    for (const { n } of sorted) {
      const prev = kept.at(-1);
      if (prev && noteEnd(prev) > n.start) {
        if (prev.start === n.start) kept.pop();
        else kept[kept.length - 1] = { ...prev, duration: n.start - prev.start };
      }
      kept.push(n);
    }
    out.push(...kept);
  }
  return out;
}

/**
 * `others` are the notes that were not edited; `edited` the (normalised) result of the edit. Returns the
 * other notes, trimmed or removed where an edited note lies on them, plus the edited notes.
 */
export function resolveOverlaps(others: readonly Note[], edited: readonly Note[]): Note[] {
  const settled = settleEdited(edited);
  const byPitch = new Map<number, Note[]>();
  for (const n of settled) {
    const list = byPitch.get(n.pitch);
    if (list) list.push(n);
    else byPitch.set(n.pitch, [n]);
  }
  for (const list of byPitch.values()) list.sort((a, b) => a.start - b.start);

  const result: Note[] = [];
  for (const o of others) {
    const list = byPitch.get(o.pitch);
    let cur: Note | null = o;
    if (list) {
      for (const e of list) {
        if (!cur) break;
        if (!overlaps(cur, e)) continue;
        if (cur.start < e.start) cur = { ...cur, duration: e.start - cur.start };
        else if (noteEnd(cur) <= noteEnd(e)) cur = null;
        else cur = { ...cur, duration: noteEnd(cur) - noteEnd(e), start: noteEnd(e) };
      }
    }
    if (cur) result.push(cur);
  }
  return result.concat(settled);
}

export interface NoteEdit {
  /** Notes to take out (by id). */
  remove?: Iterable<string>;
  /** Notes to put in: new ones, or replacements for existing ones with the same id. */
  upsert?: readonly Note[];
  /** Notes may not end after this tick. */
  limit: number;
}

/** Apply an edit to a track's notes: normalise, resolve overlaps, keep the canonical order. */
export function applyEdit(all: readonly Note[], edit: NoteEdit): Note[] {
  const gone = new Set<string>(edit.remove ?? []);
  const upsert = edit.upsert ?? [];
  for (const n of upsert) gone.add(n.id);
  const others = gone.size === 0 ? all : all.filter((n) => !gone.has(n.id));
  const edited: Note[] = [];
  for (const n of upsert) {
    const ok = normalizeNote(n, edit.limit);
    if (ok) edited.push(ok);
  }
  return sortNotes(resolveOverlaps(others, edited));
}

/** The end of the timeline an edit may use: the song, or farther if the notes being edited already ran past it. */
export function editLimit(songTicks: number, touched: readonly Note[]): number {
  let limit = songTicks;
  for (const n of touched) limit = Math.max(limit, noteEnd(n));
  return limit;
}

// ---- diffs: what an undo step stores -----------------------------------------------------------

/** What one edit did to a track: the old versions of notes it removed or changed, the new versions of those it added or changed. */
export interface NoteDiff {
  removed: Note[];
  added: Note[];
}

const sameNote = (a: Note, b: Note): boolean =>
  a.pitch === b.pitch && a.start === b.start && a.duration === b.duration && a.velocity === b.velocity;

/** The difference between two note lists, or null when they hold the same notes. */
export function diffNotes(before: readonly Note[], after: readonly Note[]): NoteDiff | null {
  const old = new Map(before.map((n) => [n.id, n]));
  const removed: Note[] = [];
  const added: Note[] = [];
  for (const n of after) {
    const o = old.get(n.id);
    if (!o) added.push(n);
    else {
      old.delete(n.id);
      if (!sameNote(o, n)) {
        removed.push(o);
        added.push(n);
      }
    }
  }
  for (const o of old.values()) removed.push(o);
  return removed.length === 0 && added.length === 0 ? null : { removed, added };
}

/** Do the diff: take out every note it mentions, put the added ones in. */
export function applyDiff(notes: readonly Note[], d: NoteDiff): Note[] {
  const ids = new Set<string>();
  for (const n of d.removed) ids.add(n.id);
  for (const n of d.added) ids.add(n.id);
  return sortNotes(notes.filter((n) => !ids.has(n.id)).concat(d.added));
}

export const invertDiff = (d: NoteDiff): NoteDiff => ({ removed: d.added, added: d.removed });
