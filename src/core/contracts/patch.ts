/**
 * Patch contract (plan T0.2, LOCKED). A patch is a plain JSON object holding every
 * patch-scoped registry parameter. PatchSchema is DERIVED from the registry, never hand-written.
 */
import { z } from 'zod';
import {
  PATCH_PARAM_DEFS,
  defaultPatchParams,
  type PatchParamId,
  type PatchParams,
} from '../params/registry';
import type { ParamDef } from '../params/types';

export const PATCH_SCHEMA_VERSION = 1;

export interface Patch {
  schemaVersion: typeof PATCH_SCHEMA_VERSION;
  name: string;
  params: PatchParams;
}

function schemaFor(def: ParamDef): z.ZodType {
  switch (def.type) {
    case 'continuous':
      return z.number().finite().min(def.min).max(def.max).default(def.default);
    case 'enum': {
      const values = def.options.map((o) => o.value) as [string, ...string[]];
      return z.enum(values).default(def.default);
    }
    case 'bool':
      return z.boolean().default(def.default);
  }
}

/** Missing params fall back to registry defaults, so older / partial patches still load. */
export const PatchParamsSchema = z.object(
  Object.fromEntries(PATCH_PARAM_DEFS.map((d) => [d.id, schemaFor(d)])),
) as unknown as z.ZodType<PatchParams, unknown>;

export const PatchSchema = z.object({
  schemaVersion: z.literal(PATCH_SCHEMA_VERSION),
  name: z.string().min(1).max(64),
  params: PatchParamsSchema,
}) as unknown as z.ZodType<Patch, unknown>;

/** A named patch plus teaching metadata. Used for factory presets and user presets (T2.5). */
export interface Preset {
  schemaVersion: typeof PATCH_SCHEMA_VERSION;
  id: string;
  name: string;
  description?: string;
  /** Help entry id (section or control) that this preset demonstrates. */
  teaches?: string;
  /** MIDI note that shows the preset off in its natural register (a bass is auditioned low, a lead high). */
  auditionPitch?: number;
  patch: Patch;
}

export const PresetSchema = z.object({
  schemaVersion: z.literal(PATCH_SCHEMA_VERSION),
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  teaches: z.string().min(1).optional(),
  auditionPitch: z.number().int().min(0).max(127).optional(),
  patch: PatchSchema,
}) as unknown as z.ZodType<Preset, unknown>;

export function createPatch(name = 'Init', overrides: Partial<PatchParams> = {}): Patch {
  return { schemaVersion: PATCH_SCHEMA_VERSION, name, params: { ...defaultPatchParams(), ...overrides } };
}

/** Upgrade hook for future schema versions. v1 is current, so this is the identity. */
export function migratePatch(raw: unknown): unknown {
  return raw;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function describe(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

export function parsePatch(raw: unknown): ParseResult<Patch> {
  const r = PatchSchema.safeParse(migratePatch(raw));
  return r.success ? { ok: true, value: r.data } : { ok: false, error: describe(r.error) };
}

export function parsePreset(raw: unknown): ParseResult<Preset> {
  const r = PresetSchema.safeParse(migratePatch(raw));
  return r.success ? { ok: true, value: r.data } : { ok: false, error: describe(r.error) };
}

/** Params that differ between two patches. Used by loadPatch diffing and "Try this" (T4.3). */
export function diffPatchParams(a: PatchParams, b: PatchParams): Partial<PatchParams> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(b) as PatchParamId[]) if (a[key] !== b[key]) out[key] = b[key];
  return out as Partial<PatchParams>;
}

export { describe as describeZodError };
