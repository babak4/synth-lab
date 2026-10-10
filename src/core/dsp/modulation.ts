/**
 * Modulation constants and shapes shared by the audio engine and the UI plots, so what the plots
 * draw is by construction what the engine does.
 */

/** Filter envelope at +100% sweeps this many cents (6 octaves). */
export const FILTER_ENV_CENTS = 6 * 1200;

/** What full (100%) LFO depth means for each destination. */
export const LFO_SCALE = {
  /** ±2 semitones of vibrato. */
  pitch: 200,
  /** ±4 octaves of cutoff sweep. */
  cutoff: 4800,
  /** Tremolo swings between 1 − depth and 1 (the 0.5 is applied to a (lfo − 1) signal). */
  amp: 0.5,
  /** Pulse width moves ±0.45 around its set value, staying inside 5–95%. */
  'pulse-width': 0.45,
} as const;

export type LfoShapeName = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'sample-hold';

/**
 * LFO value (−1…1) at cycle position `phase` (0…1), matching the engine's waveforms:
 * all start at 0 except the square (+1), and the first half-cycle is positive.
 * Sample-and-hold is random, so it returns a fixed illustrative staircase.
 */
export function lfoValue(shape: LfoShapeName, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (shape) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'triangle':
      return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
    case 'sawtooth':
      return p < 0.5 ? 2 * p : 2 * p - 2;
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'sample-hold':
      return SH_STAIRCASE[Math.min(SH_STAIRCASE.length - 1, Math.floor(p * SH_STAIRCASE.length))]!;
  }
}

export const SH_STAIRCASE = [0.6, -0.3, 0.9, -0.8, 0.2, -0.5, 0.7, -0.1] as const;

/** (1 − s) + s·(velocity/127): sensitivity 0 ignores velocity, 1 is fully proportional. */
export function velocityScale(velocity: number, sensitivity: number): number {
  return 1 - sensitivity + sensitivity * (velocity / 127);
}
