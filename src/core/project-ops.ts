/**
 * Pure edits to a Project (plan T5.1). Every function returns a new project, or the same object when
 * the request is refused (the store treats "same object" as "nothing happened").
 */
import { MAX_TRACKS, TRACK_COLOURS, createTrack, newId, type Project, type Track } from './contracts/project';

export function addTrack(p: Project, patchFrom?: Track): Project {
  if (p.tracks.length >= MAX_TRACKS) return p;
  const t = createTrack(p.tracks.length, patchFrom ? structuredClone(patchFrom.patch) : undefined);
  return { ...p, tracks: [...p.tracks, { ...t, colour: nextColour(p) }] };
}

/** First palette colour no track uses, so colours stay distinct as tracks come and go. */
function nextColour(p: Project): string {
  const used = new Set(p.tracks.map((t) => t.colour));
  return TRACK_COLOURS.find((c) => !used.has(c)) ?? TRACK_COLOURS[p.tracks.length % TRACK_COLOURS.length]!;
}

/** Copy of a track (sound, notes, fader) inserted right after it. */
export function duplicateTrack(p: Project, id: string): Project {
  const i = p.tracks.findIndex((t) => t.id === id);
  if (i < 0 || p.tracks.length >= MAX_TRACKS) return p;
  const src = p.tracks[i]!;
  const copy: Track = {
    ...structuredClone(src),
    id: newId('trk'),
    name: `${src.name} copy`.slice(0, 40),
    colour: nextColour(p),
    solo: false,
    notes: src.notes.map((n) => ({ ...n, id: newId('note') })),
  };
  return { ...p, tracks: [...p.tracks.slice(0, i + 1), copy, ...p.tracks.slice(i + 1)] };
}

/** A project always keeps at least one track, so there is always something to play and edit. */
export function removeTrack(p: Project, id: string): Project {
  if (p.tracks.length <= 1 || !p.tracks.some((t) => t.id === id)) return p;
  return { ...p, tracks: p.tracks.filter((t) => t.id !== id) };
}

export function moveTrack(p: Project, id: string, toIndex: number): Project {
  const from = p.tracks.findIndex((t) => t.id === id);
  const to = Math.max(0, Math.min(p.tracks.length - 1, toIndex));
  if (from < 0 || from === to) return p;
  const tracks = [...p.tracks];
  tracks.splice(to, 0, tracks.splice(from, 1)[0]!);
  return { ...p, tracks };
}

export function updateTrack(p: Project, id: string, change: Partial<Omit<Track, 'id'>>): Project {
  const i = p.tracks.findIndex((t) => t.id === id);
  if (i < 0) return p;
  const tracks = [...p.tracks];
  tracks[i] = { ...tracks[i]!, ...change };
  return { ...p, tracks };
}
