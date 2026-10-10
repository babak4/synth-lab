/**
 * Value ↔ normalised position (0–1) mapping, quantisation and display formatting.
 * Pure functions; used by every control (T0.3) and by the engine for scale-aware smoothing.
 */
import type { ContinuousParamDef, ParamDef } from './types';

/** Exponent for `scale: 'exp'` — emphasises the low end of the range (e.g. glide times). */
export const EXP_POWER = 2;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function clamp(def: ContinuousParamDef, value: number): number {
  return Math.min(def.max, Math.max(def.min, value));
}

/** Snap to the def's `step` (anchored at `min`) and clamp. Step 0 only clamps. */
export function quantise(def: ContinuousParamDef, value: number): number {
  const v = clamp(def, value);
  if (def.step <= 0) return v;
  const snapped = def.min + Math.round((v - def.min) / def.step) * def.step;
  // Trim float noise (e.g. 0.30000000000000004) to the precision of the step.
  const decimals = Math.max(0, -Math.floor(Math.log10(def.step)));
  return clamp(def, Number(snapped.toFixed(decimals)));
}

/** Value → 0–1 control position. */
export function valueToNorm(def: ContinuousParamDef, value: number): number {
  const v = clamp(def, value);
  switch (def.scale) {
    case 'linear':
      return (v - def.min) / (def.max - def.min);
    case 'log':
      return Math.log(v / def.min) / Math.log(def.max / def.min);
    case 'exp':
      return clamp01((v - def.min) / (def.max - def.min)) ** (1 / EXP_POWER);
  }
}

/** 0–1 control position → value (quantised to the def's step). */
export function normToValue(def: ContinuousParamDef, norm: number): number {
  const n = clamp01(norm);
  let v: number;
  switch (def.scale) {
    case 'linear':
      v = def.min + n * (def.max - def.min);
      break;
    case 'log':
      v = def.min * Math.pow(def.max / def.min, n);
      break;
    case 'exp':
      v = def.min + n ** EXP_POWER * (def.max - def.min);
      break;
  }
  return quantise(def, v);
}

/** Number of discrete positions of a stepped control, or null if continuous. */
export function stepCount(def: ContinuousParamDef): number | null {
  return def.step > 0 ? Math.round((def.max - def.min) / def.step) + 1 : null;
}

// ─── display ───────────────────────────────────────────────────────────────────────────────

function sig(n: number, digits: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  const decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(abs)));
  return n.toFixed(Math.min(decimals, 4));
}

/** Human-readable value with unit, used for labels and ARIA `aria-valuetext`. */
export function formatValue(def: ParamDef, value: number | string | boolean): string {
  if (def.type === 'bool') return value ? 'On' : 'Off';
  if (def.type === 'enum') return def.options.find((o) => o.value === value)?.label ?? String(value);

  const v = Number(value);
  switch (def.unit) {
    case '%':
      return `${Math.round(v * 100)}%`;
    case 's':
      return v < 1 ? `${sig(v * 1000, 3)} ms` : `${sig(v, 3)} s`;
    case 'Hz':
      return v >= 1000 ? `${sig(v / 1000, 3)} kHz` : `${sig(v, 3)} Hz`;
    case 'cents':
      return `${v > 0 ? '+' : ''}${Math.round(v)} cents`;
    case 'semitones':
      return `${v > 0 ? '+' : ''}${Math.round(v)} st`;
    case 'octaves':
      return `${v > 0 ? '+' : ''}${Math.round(v)} oct`;
    case 'dB':
      return v <= -60 ? '−∞ dB' : `${v.toFixed(1).replace('-', '−')} dB`;
    case 'Q':
      return `Q ${sig(v, 2)}`;
    case 'voices':
      return `${Math.round(v)} ${Math.round(v) === 1 ? 'voice' : 'voices'}`;
    case 'velocity':
      return `${Math.round(v)}`;
    case '':
      return sig(v, 3);
  }
}
