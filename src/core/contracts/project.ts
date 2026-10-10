/**
 * Project contract (plan T0.2, LOCKED). All time is stored in ticks; PPQ = 960.
 */
import { z } from 'zod';
import { PatchSchema, createPatch, type Patch } from './patch';

export const PPQ = 960;
export const PROJECT_SCHEMA_VERSION = 1;
export const MAX_TRACKS = 8;

export const TIME_SIGNATURES = [
  { numerator: 3, denominator: 4 },
  { numerator: 4, denominator: 4 },
  { numerator: 6, denominator: 8 },
] as const;

export interface TimeSignature {
  numerator: 3 | 4 | 6;
  denominator: 4 | 8;
}

export const TimeSignatureSchema = z
  .object({ numerator: z.number().int(), denominator: z.number().int() })
  .refine((s) => TIME_SIGNATURES.some((t) => t.numerator === s.numerator && t.denominator === s.denominator), {
    message: 'Time signature must be 3/4, 4/4 or 6/8',
  }) as unknown as z.ZodType<TimeSignature, unknown>;

/** Ticks in one bar: a whole note is 4 quarter notes. 4/4 → 3840, 3/4 → 2880, 6/8 → 2880. */
export function ticksPerBar(sig: TimeSignature): number {
  return Math.round((PPQ * 4 * sig.numerator) / sig.denominator);
}

export interface Note {
  id: string;
  /** MIDI note number 0–127 (C4 = 60). */
  pitch: number;
  /** Ticks from project start, ≥ 0. */
  start: number;
  /** Ticks, ≥ 1. */
  duration: number;
  /** 1–127. */
  velocity: number;
}

export const NoteSchema = z.object({
  id: z.string().min(1),
  pitch: z.number().int().min(0).max(127),
  start: z.number().int().min(0),
  duration: z.number().int().min(1),
  velocity: z.number().int().min(1).max(127),
}) as unknown as z.ZodType<Note, unknown>;

export interface Track {
  id: string;
  name: string;
  /** CSS colour string, e.g. '#e4572e'. */
  colour: string;
  /** Fader in dB; ≤ -60 is silence. */
  volumeDb: number;
  mute: boolean;
  solo: boolean;
  patch: Patch;
  notes: Note[];
}

export const TrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  colour: z.string().min(1),
  volumeDb: z.number().finite().min(-60).max(6),
  mute: z.boolean(),
  solo: z.boolean(),
  patch: PatchSchema,
  notes: z.array(NoteSchema),
}) as unknown as z.ZodType<Track, unknown>;

export interface LoopRegion {
  enabled: boolean;
  /** Zero-based first bar, inclusive. */
  startBar: number;
  /** Zero-based end bar, exclusive. */
  endBar: number;
}

export interface Project {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  name: string;
  tempo: number;
  timeSignature: TimeSignature;
  lengthBars: number;
  loop: LoopRegion;
  tracks: Track[];
}

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
    name: z.string().min(1).max(80),
    tempo: z.number().finite().min(40).max(240),
    timeSignature: TimeSignatureSchema,
    lengthBars: z.number().int().min(1).max(64),
    loop: z.object({
      enabled: z.boolean(),
      startBar: z.number().int().min(0),
      endBar: z.number().int().min(1),
    }),
    tracks: z.array(TrackSchema).max(MAX_TRACKS),
  })
  .superRefine((p, ctx) => {
    if (p.loop.startBar >= p.loop.endBar || p.loop.endBar > p.lengthBars)
      ctx.addIssue({ code: 'custom', path: ['loop'], message: 'Loop must satisfy startBar < endBar ≤ lengthBars' });
    const ids = new Set<string>();
    p.tracks.forEach((t, i) => {
      if (ids.has(t.id)) ctx.addIssue({ code: 'custom', path: ['tracks', i, 'id'], message: 'Duplicate track id' });
      ids.add(t.id);
    });
  }) as unknown as z.ZodType<Project, unknown>;

export const TRACK_COLOURS = [
  '#e4572e', '#f3a712', '#a8c686', '#29a19c', '#4a90d9', '#7b6cd9', '#c264b5', '#8d8d8d',
] as const;

let idCounter = 0;
/** Short unique id; crypto-backed where available. */
export function newId(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}${(idCounter++).toString(36)}`;
  return `${prefix}_${rand}`;
}

export function createTrack(index: number, patch: Patch = createPatch()): Track {
  return {
    id: newId('trk'),
    name: `Track ${index + 1}`,
    colour: TRACK_COLOURS[index % TRACK_COLOURS.length]!,
    volumeDb: 0,
    mute: false,
    solo: false,
    patch,
    notes: [],
  };
}

export function createProject(): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: 'Untitled',
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    lengthBars: 8,
    loop: { enabled: true, startBar: 0, endBar: 8 },
    tracks: [createTrack(0)],
  };
}

/** Upgrade hook for future schema versions. v1 is current, so this is the identity. */
export function migrateProject(raw: unknown): unknown {
  return raw;
}

export function parseProject(raw: unknown): { ok: true; value: Project } | { ok: false; error: string } {
  const r = ProjectSchema.safeParse(migrateProject(raw));
  return r.success
    ? { ok: true, value: r.data }
    : { ok: false, error: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') };
}
