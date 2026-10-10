/**
 * THE parameter registry: single source of truth for every control (plan T0.2, LOCKED).
 *
 * Do not edit without the orchestrator. Everything else is derived from this file:
 * PatchSchema, UI controls (range / scale / unit), engine bindings, help-content checks.
 *
 * PRD coverage: §3.1–§3.7 (synth), §5.2 (keyboard controls).
 * Deviation from PRD: filter resonance minimum is 0.1 (not 0) because a Q of 0 is meaningless
 * for a biquad; the engine converts this linear Q to the filter's native units.
 */
import type {
  BoolParamDef,
  ContinuousParamDef,
  EnumOption,
  EnumParamDef,
  ParamScope,
  SectionDef,
  SectionId,
  Stage,
  Unit,
  Scale,
} from './types';

// ─── authoring helpers (preserve literal id / option types) ────────────────────────────────

interface NumOpts {
  min: number;
  max: number;
  default: number;
  scale?: Scale;
  unit?: Unit;
  step?: number;
  smoothingMs?: number;
  stage?: Stage;
  short?: string;
}

/** `short` (authoring name) → `shortLabel` (field). */
function withShort<T extends { short?: string }>(o: T): Omit<T, 'short'> & { shortLabel?: string } {
  const { short, ...rest } = o;
  return short ? { ...rest, shortLabel: short } : rest;
}

function num<const I extends string>(
  id: I,
  section: SectionId,
  label: string,
  o: NumOpts,
): ContinuousParamDef & { readonly id: I } {
  return {
    id,
    section,
    label,
    helpId: id,
    scope: 'patch',
    stage: 'voice',
    smoothingMs: 10,
    scale: 'linear',
    unit: '',
    step: 0,
    ...withShort(o),
    type: 'continuous',
  };
}

function oneOf<const I extends string, const V extends string>(
  id: I,
  section: SectionId,
  label: string,
  options: readonly EnumOption<V>[],
  def: NoInfer<V>,
  o: { smoothingMs?: number; stage?: Stage; short?: string } = {},
): EnumParamDef<V> & { readonly id: I } {
  return {
    id,
    section,
    label,
    helpId: id,
    scope: 'patch',
    stage: 'voice',
    smoothingMs: 0,
    ...withShort(o),
    options,
    default: def,
    type: 'enum',
  };
}

function flag<const I extends string>(
  id: I,
  section: SectionId,
  label: string,
  def: boolean,
  o: { stage?: Stage; short?: string } = {},
): BoolParamDef & { readonly id: I } {
  return { id, section, label, helpId: id, scope: 'patch', stage: 'voice', smoothingMs: 0, ...withShort(o), default: def, type: 'bool' };
}

const WAVES = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'square', label: 'Square' },
  { value: 'pulse', label: 'Pulse' },
] as const;

const DIVISIONS = [
  { value: '1/1', label: '1/1' },
  { value: '1/2', label: '1/2' },
  { value: '1/4', label: '1/4' },
  { value: '1/8', label: '1/8' },
  { value: '1/16', label: '1/16' },
  { value: '1/32', label: '1/32' },
] as const;

// ─── patch parameters ──────────────────────────────────────────────────────────────────────

/** Per-oscillator controls; A and B share a shape. */
function oscillator<const K extends 'a' | 'b'>(k: K) {
  const L = k.toUpperCase();
  return [
    k === 'a'
      ? oneOf(`osc-${k}-waveform`, 'oscillators', `Waveform ${L}`, WAVES, 'sawtooth', { smoothingMs: 10, short: 'Waveform' })
      : oneOf(`osc-${k}-waveform`, 'oscillators', `Waveform ${L}`, [{ value: 'off', label: 'Off' }, ...WAVES], 'off', {
          smoothingMs: 10,
          short: 'Waveform',
        }),
    num(`osc-${k}-octave`, 'oscillators', `Octave ${L}`, { min: -2, max: 2, default: 0, step: 1, unit: 'octaves', short: 'Octave' }),
    num(`osc-${k}-semitone`, 'oscillators', `Semitone ${L}`, { min: -12, max: 12, default: 0, step: 1, unit: 'semitones', short: 'Semitone' }),
    num(`osc-${k}-fine`, 'oscillators', `Fine tune ${L}`, { min: -50, max: 50, default: 0, step: 0, unit: 'cents', short: 'Fine' }),
    num(`osc-${k}-pulse-width`, 'oscillators', `Pulse width ${L}`, { min: 0.05, max: 0.95, default: 0.5, unit: '%', short: 'Pulse' }),
  ] as const;
}

const [oscAWave, oscAOct, oscASemi, oscAFine, oscAPw] = oscillator('a');
const [oscBWave, oscBOct, oscBSemi, oscBFine, oscBPw] = oscillator('b');

function envelope<const P extends 'amp' | 'filter'>(p: P) {
  const P = p === 'amp' ? 'Amp' : 'Filter';
  const section: SectionId = p === 'amp' ? 'ampEnv' : 'filterEnv';
  const d = p === 'amp' ? { a: 0.005, d: 0.2, s: 0.8, r: 0.3, v: 0.5 } : { a: 0.005, d: 0.3, s: 0.3, r: 0.3, v: 0 };
  return [
    num(`${p}-env-attack`, section, `${P} attack`, { short: 'Attack', min: 0.001, max: 5, default: d.a, scale: 'log', unit: 's', smoothingMs: 0 }),
    num(`${p}-env-decay`, section, `${P} decay`, { short: 'Decay', min: 0.001, max: 5, default: d.d, scale: 'log', unit: 's', smoothingMs: 0 }),
    num(`${p}-env-sustain`, section, `${P} sustain`, { short: 'Sustain', min: 0, max: 1, default: d.s, unit: '%' }),
    num(`${p}-env-release`, section, `${P} release`, { short: 'Release', min: 0.001, max: 10, default: d.r, scale: 'log', unit: 's', smoothingMs: 0 }),
    num(`${p}-env-velocity`, section, `${P} velocity sensitivity`, { min: 0, max: 1, default: d.v, unit: '%', short: 'Velocity' }),
  ] as const;
}

const [ampA, ampD, ampS, ampR, ampV] = envelope('amp');
const [filtA, filtD, filtS, filtR, filtV] = envelope('filter');

export const PATCH_PARAM_DEFS = [
  // §3.1 Oscillators
  oscAWave, oscAOct, oscASemi, oscAFine, oscAPw,
  oscBWave, oscBOct, oscBSemi, oscBFine, oscBPw,
  oneOf('sub-waveform', 'oscillators', 'Sub oscillator', [
    { value: 'off', label: 'Off' },
    { value: 'sine', label: 'Sine' },
    { value: 'square', label: 'Square' },
  ], 'off', { smoothingMs: 10, short: 'Waveform' }),
  num('sub-octave', 'oscillators', 'Sub octave', { min: -2, max: -1, default: -1, step: 1, unit: 'octaves', short: 'Octave' }),

  // §3.1 Mixer
  num('mix-osc-a', 'mixer', 'Oscillator A level', { min: 0, max: 1, default: 0.8, unit: '%', short: 'Osc A' }),
  num('mix-osc-b', 'mixer', 'Oscillator B level', { min: 0, max: 1, default: 0, unit: '%', short: 'Osc B' }),
  num('mix-sub', 'mixer', 'Sub level', { min: 0, max: 1, default: 0, unit: '%', short: 'Sub' }),
  num('mix-noise', 'mixer', 'Noise level', { min: 0, max: 1, default: 0, unit: '%', short: 'Noise' }),

  // §3.2 Filter
  oneOf('filter-type', 'filter', 'Type', [
    { value: 'lowpass', label: 'Low-pass' },
    { value: 'highpass', label: 'High-pass' },
    { value: 'bandpass', label: 'Band-pass' },
    { value: 'notch', label: 'Notch' },
  ], 'lowpass', { smoothingMs: 10 }),
  num('filter-cutoff', 'filter', 'Cutoff', { min: 20, max: 20000, default: 8000, scale: 'log', unit: 'Hz' }),
  num('filter-resonance', 'filter', 'Resonance', { min: 0.1, max: 20, default: 1, unit: 'Q' }),
  num('filter-env-amount', 'filter', 'Envelope amount', { min: -1, max: 1, default: 0, unit: '%', short: 'Env amt' }),
  num('filter-key-tracking', 'filter', 'Key tracking', { min: 0, max: 1, default: 0, step: 0.5, unit: '%' }),

  // §3.3 Envelopes
  ampA, ampD, ampS, ampR, ampV,
  filtA, filtD, filtS, filtR, filtV,

  // §3.4 LFO
  oneOf('lfo-shape', 'lfo', 'Shape', [
    { value: 'sine', label: 'Sine' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'sawtooth', label: 'Sawtooth' },
    { value: 'square', label: 'Square' },
    { value: 'sample-hold', label: 'Sample & hold' },
  ], 'sine', { smoothingMs: 10 }),
  flag('lfo-sync', 'lfo', 'LFO tempo sync', false),
  num('lfo-rate', 'lfo', 'Rate', { min: 0.05, max: 20, default: 4, scale: 'log', unit: 'Hz' }),
  oneOf('lfo-division', 'lfo', 'LFO division', DIVISIONS, '1/4', { short: 'Division' }),
  num('lfo-depth', 'lfo', 'Depth', { min: 0, max: 1, default: 0, unit: '%' }),
  oneOf('lfo-destination', 'lfo', 'Destination', [
    { value: 'pitch', label: 'Pitch' },
    { value: 'cutoff', label: 'Cutoff' },
    { value: 'amp', label: 'Amp' },
    { value: 'pulse-width', label: 'Pulse width' },
  ], 'cutoff', { smoothingMs: 10 }),
  flag('lfo-retrigger', 'lfo', 'Retrigger', false),

  // §3.5 Voicing
  oneOf('voice-mode', 'voicing', 'Mode', [
    { value: 'poly', label: 'Poly' },
    { value: 'mono', label: 'Mono' },
    { value: 'legato', label: 'Legato' },
  ], 'poly'),
  num('voice-count', 'voicing', 'Voices', { min: 1, max: 8, default: 8, step: 1, unit: 'voices', smoothingMs: 0 }),
  num('voice-glide', 'voicing', 'Glide', { min: 0, max: 2, default: 0, scale: 'exp', unit: 's', smoothingMs: 0 }),
  num('master-tune', 'voicing', 'Master tune (A4)', { short: 'Tune A4', min: 430, max: 450, default: 440, step: 1, unit: 'Hz' }),

  // §3.6 Effects (fixed order: distortion → delay → reverb)
  flag('dist-on', 'distortion', 'Distortion on', false, { stage: 'fx' }),
  num('dist-drive', 'distortion', 'Drive', { min: 0, max: 36, default: 12, unit: 'dB', stage: 'fx' }),
  num('dist-tone', 'distortion', 'Tone', { min: 200, max: 20000, default: 8000, scale: 'log', unit: 'Hz', stage: 'fx' }),
  num('dist-mix', 'distortion', 'Distortion mix', { short: 'Mix', min: 0, max: 1, default: 0.5, unit: '%', stage: 'fx' }),

  flag('delay-on', 'delay', 'Delay on', false, { stage: 'fx' }),
  flag('delay-sync', 'delay', 'Delay tempo sync', false, { stage: 'fx' }),
  num('delay-time', 'delay', 'Time', { min: 0.01, max: 2, default: 0.3, scale: 'log', unit: 's', stage: 'fx' }),
  oneOf('delay-division', 'delay', 'Delay division', DIVISIONS, '1/8', { stage: 'fx', short: 'Division' }),
  num('delay-feedback', 'delay', 'Feedback', { min: 0, max: 0.9, default: 0.4, unit: '%', stage: 'fx' }),
  flag('delay-pingpong', 'delay', 'Ping-pong', false, { stage: 'fx' }),
  num('delay-mix', 'delay', 'Delay mix', { short: 'Mix', min: 0, max: 1, default: 0.3, unit: '%', stage: 'fx' }),

  flag('reverb-on', 'reverb', 'Reverb on', false, { stage: 'fx' }),
  oneOf('reverb-size', 'reverb', 'Size', [
    { value: 'short', label: 'Short' },
    { value: 'room', label: 'Room' },
    { value: 'hall', label: 'Hall' },
  ], 'room', { smoothingMs: 50, stage: 'fx' }),
  num('reverb-mix', 'reverb', 'Reverb mix', { short: 'Mix', min: 0, max: 1, default: 0.25, unit: '%', stage: 'fx' }),
] as const;

// ─── global (non-patch) parameters ─────────────────────────────────────────────────────────

function asGlobal<T extends { scope: ParamScope; stage: Stage }>(d: T): T & { scope: 'global' } {
  return { ...d, scope: 'global' };
}

export const GLOBAL_PARAM_DEFS = [
  // §3.7 Master. Starts at −12 dB (hearing safety, PRD §7.4). The limiter is not a parameter: it cannot be disabled.
  asGlobal(num('master-volume', 'master', 'Master volume', { min: -60, max: 0, default: -12, unit: 'dB', stage: 'master' })),
  // §5.2 Keyboard. Octave offset 0 = lower manual starts at C3. [-3, 2] keeps both manuals inside C0–C8.
  asGlobal(num('kbd-octave', 'keyboard', 'Octave', { min: -3, max: 2, default: 0, step: 1, unit: 'octaves', smoothingMs: 0, stage: 'ui' })),
  asGlobal(num('kbd-velocity', 'keyboard', 'Velocity', { min: 1, max: 127, default: 96, step: 1, unit: 'velocity', smoothingMs: 0, stage: 'ui' })),
] as const;

export const PARAM_DEFS = [...PATCH_PARAM_DEFS, ...GLOBAL_PARAM_DEFS] as const;

// ─── derived types ─────────────────────────────────────────────────────────────────────────

type PatchDef = (typeof PATCH_PARAM_DEFS)[number];
type AnyDef = (typeof PARAM_DEFS)[number];

export type PatchParamId = PatchDef['id'];
export type GlobalParamId = (typeof GLOBAL_PARAM_DEFS)[number]['id'];
export type ParamId = AnyDef['id'];

type DefFor<I extends ParamId> = Extract<AnyDef, { id: I }>;

/** The value type of parameter `I`: number, boolean, or the union of its enum option values. */
export type ParamValue<I extends ParamId> =
  DefFor<I> extends BoolParamDef
    ? boolean
    : DefFor<I> extends EnumParamDef<infer V>
      ? V
      : DefFor<I> extends ContinuousParamDef
        ? number
        : never;

export type PatchParams = { [I in PatchParamId]: ParamValue<I> };

// ─── lookup ────────────────────────────────────────────────────────────────────────────────

const BY_ID: ReadonlyMap<string, AnyDef> = new Map(PARAM_DEFS.map((d) => [d.id, d]));

export function getParamDef<I extends ParamId>(id: I): DefFor<I> {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown parameter id: ${id}`);
  return def as DefFor<I>;
}

export function isParamId(id: string): id is ParamId {
  return BY_ID.has(id);
}

export function isPatchParamId(id: string): id is PatchParamId {
  const d = BY_ID.get(id);
  return d !== undefined && d.scope === 'patch';
}

export function defaultPatchParams(): PatchParams {
  return Object.fromEntries(PATCH_PARAM_DEFS.map((d) => [d.id, d.default])) as PatchParams;
}

// ─── sections ──────────────────────────────────────────────────────────────────────────────

export const SECTIONS: readonly SectionDef[] = [
  { id: 'oscillators', title: 'Oscillators', helpId: 'oscillators', order: 1 },
  { id: 'mixer', title: 'Mixer', helpId: 'mixer', order: 2 },
  { id: 'filter', title: 'Filter', helpId: 'filter', order: 3 },
  { id: 'ampEnv', title: 'Amp envelope', helpId: 'envelopes', order: 4 },
  { id: 'filterEnv', title: 'Filter envelope', helpId: 'envelopes', order: 5 },
  { id: 'lfo', title: 'LFO', helpId: 'lfo', order: 6 },
  { id: 'voicing', title: 'Voicing', helpId: 'voicing', order: 7 },
  { id: 'distortion', title: 'Distortion', helpId: 'effects', order: 8 },
  { id: 'delay', title: 'Delay', helpId: 'effects', order: 9 },
  { id: 'reverb', title: 'Reverb', helpId: 'effects', order: 10 },
  { id: 'master', title: 'Master', helpId: 'master', order: 11 },
  { id: 'keyboard', title: 'Keyboard', helpId: 'keyboard', order: 12 },
];

/** Section help entries that exist without owning registry controls (PRD §4.3). */
export const EXTRA_SECTION_HELP_IDS = ['composition'] as const;

/** Every long (section) help entry id, in signal-flow order. */
export const SECTION_HELP_IDS: readonly string[] = [
  ...new Set([...SECTIONS].sort((a, b) => a.order - b.order).map((s) => s.helpId)),
  ...EXTRA_SECTION_HELP_IDS,
];

/** Every short (control) help entry id. */
export const CONTROL_HELP_IDS: readonly string[] = PARAM_DEFS.map((d) => d.helpId);

export function paramsInSection(section: SectionId): readonly AnyDef[] {
  return PARAM_DEFS.filter((d) => d.section === section);
}
