/**
 * Geometry for the per-section plots (plan T2.4): filter response with live modulation, ADSR shapes
 * with a dot per active voice, and the LFO cycle with a phase marker. Pure, in 0–1 plot coordinates
 * (x right, y up), so the canvas code only scales and strokes.
 */
import type { EnvPosition, VoiceState } from '../contracts/engine';
import { FILTER_ENV_CENTS, LFO_SCALE, lfoValue, type LfoShapeName } from '../dsp/modulation';

// ── filter ────────────────────────────────────────────────────────────────────────────────────

export interface FilterParams {
  cutoff: number;
  envAmount: number;
  keyTracking: number;
  lfoDestination: string;
  lfoDepth: number;
  lfoShape: LfoShapeName;
}

/**
 * Where the filter's cutoff actually is right now for one voice: the set cutoff moved by the filter
 * envelope, key tracking and (if it targets the cutoff) the LFO. With no voice, the set cutoff.
 * All modulation is in cents, exactly as in the engine (exponential in frequency).
 */
export function effectiveCutoffHz(p: FilterParams, voice: VoiceState | null, lfoPhase: number, nyquist = 24000): number {
  if (!voice) return p.cutoff;
  let cents = voice.filter.level * p.envAmount * FILTER_ENV_CENTS;
  cents += p.keyTracking * (voice.pitch - 60) * 100;
  if (p.lfoDestination === 'cutoff') cents += p.lfoDepth * LFO_SCALE.cutoff * lfoValue(p.lfoShape, lfoPhase);
  return Math.min(nyquist, Math.max(20, p.cutoff * 2 ** (cents / 1200)));
}

// ── envelopes ─────────────────────────────────────────────────────────────────────────────────

export interface EnvShape {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/** Same RT60 convention as the engine: decay/release cover 60 dB of their distance in the stated time. */
const LN_1000 = Math.log(1000);

export interface EnvLayout {
  /** Fractions of the plot width for attack, decay, hold and release; they sum to 1. */
  attack: number;
  decay: number;
  hold: number;
  release: number;
}

/**
 * Plot widths for the four stages. Times span 1 ms…10 s, so widths follow log(1 + 1000·t): short and
 * long stages are both visible. The hold (sustain) segment has a fixed share.
 */
export function envelopeLayout(s: EnvShape): EnvLayout {
  const w = (t: number) => 0.4 + Math.log10(1 + 1000 * t);
  const a = w(s.attack);
  const d = w(s.decay);
  const r = w(s.release);
  const hold = 1.2;
  const total = a + d + hold + r;
  return { attack: a / total, decay: d / total, hold: hold / total, release: r / total };
}

export interface Point {
  x: number;
  y: number;
}

/** Polyline of the whole ADSR, `n` points per stage. */
export function envelopePoints(s: EnvShape, n = 24): Point[] {
  const L = envelopeLayout(s);
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) pts.push({ x: (i / n) * L.attack, y: i / n });
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    pts.push({ x: L.attack + u * L.decay, y: s.sustain + (1 - s.sustain) * Math.exp(-u * LN_1000) });
  }
  pts.push({ x: L.attack + L.decay + L.hold, y: s.sustain });
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    pts.push({ x: L.attack + L.decay + L.hold + u * L.release, y: s.sustain * Math.exp(-u * LN_1000) });
  }
  return pts;
}

/**
 * Where a voice's dot sits on the envelope plot. `peak` is the velocity-scaled peak the voice's level is
 * measured against, so a quiet note rides the same curve instead of a smaller one.
 */
export function envelopeDot(s: EnvShape, pos: EnvPosition, peak: number): Point {
  const L = envelopeLayout(s);
  const y = Math.min(1, Math.max(0, pos.level / Math.max(peak, 1e-6)));
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  switch (pos.stage) {
    case 'attack':
      return { x: clamp01(pos.elapsed / s.attack) * L.attack, y };
    case 'decay':
      return { x: L.attack + clamp01(pos.elapsed / s.decay) * L.decay, y };
    case 'sustain':
      // Drifts across the hold segment so a held note visibly "stays" without running off the end.
      return { x: L.attack + L.decay + L.hold * (1 - Math.exp(-pos.elapsed / 2)) * 0.9, y: s.sustain };
    case 'release':
      return { x: L.attack + L.decay + L.hold + clamp01(pos.elapsed / s.release) * L.release, y };
  }
}

// ── LFO ───────────────────────────────────────────────────────────────────────────────────────

/** One LFO cycle as a polyline, y in 0–1 (0.5 = zero). */
export function lfoPoints(shape: LfoShapeName, n = 128): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) pts.push({ x: i / n, y: 0.5 + 0.5 * lfoValue(shape, i / n === 1 ? 1 - 1e-9 : i / n) });
  return pts;
}

export const lfoMarker = (shape: LfoShapeName, phase: number): Point => ({
  x: phase - Math.floor(phase),
  y: 0.5 + 0.5 * lfoValue(shape, phase),
});
