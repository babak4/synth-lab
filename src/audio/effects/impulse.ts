/**
 * Procedural reverb impulse responses (plan T1.6): decaying, progressively darker noise with a few
 * early reflections. Pure and seeded, so the result is deterministic (and golden-testable).
 */
export type ReverbSize = 'short' | 'room' | 'hall';

export interface ImpulseSpec {
  /** Time for the tail to fall 60 dB, in seconds. */
  rt60: number;
  /** Silence before the first reflection. */
  preDelay: number;
  /** Cutoff (Hz) of the one-pole darkening at t=0 and at the end of the tail. */
  brightHz: number;
  darkHz: number;
  /** Early reflection count and the time window they fall in. */
  earlyCount: number;
  earlySpread: number;
}

export const IMPULSE_SPECS: Record<ReverbSize, ImpulseSpec> = {
  short: { rt60: 0.45, preDelay: 0.002, brightHz: 9000, darkHz: 2500, earlyCount: 4, earlySpread: 0.02 },
  room: { rt60: 1.3, preDelay: 0.008, brightHz: 8000, darkHz: 1800, earlyCount: 8, earlySpread: 0.04 },
  hall: { rt60: 3.0, preDelay: 0.02, brightHz: 7000, darkHz: 1200, earlyCount: 14, earlySpread: 0.09 },
};

/** mulberry32: tiny seeded PRNG. */
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tail length as a multiple of RT60. 1.1 ends the impulse at about −66 dB, which is inaudible under
 * any music; a longer tail only costs convolution CPU (the dominant cost of the whole engine).
 */
export const TAIL_FACTOR = 1.1;

/** Returns [left, right]. */
export function generateImpulse(size: ReverbSize, sampleRate: number): [Float32Array, Float32Array] {
  const spec = IMPULSE_SPECS[size];
  const seconds = spec.rt60 * TAIL_FACTOR + spec.preDelay;
  const n = Math.round(seconds * sampleRate);
  const tau = spec.rt60 / Math.log(1000); // amplitude time constant: −60 dB at rt60
  const pre = Math.round(spec.preDelay * sampleRate);
  const seedBase = size === 'short' ? 11 : size === 'room' ? 23 : 37;

  const channels = [0, 1].map((ch) => {
    const rand = prng(seedBase * 100 + ch);
    const out = new Float32Array(n);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sampleRate;
      // Cutoff slides from bright to dark across the tail (high frequencies die first).
      const frac = Math.min(1, t / (spec.rt60 * 1.2));
      const fc = spec.brightHz * (spec.darkHz / spec.brightHz) ** frac;
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sampleRate);
      lp += a * ((rand() * 2 - 1) - lp);
      out[i] = lp * Math.exp(-t / tau);
    }
    // Early reflections: sparse spikes, independent per channel for width.
    for (let k = 0; k < spec.earlyCount; k++) {
      const at = pre + Math.round(rand() * spec.earlySpread * sampleRate);
      if (at < n) out[at]! += (rand() < 0.5 ? -1 : 1) * (0.9 - 0.6 * (k / spec.earlyCount));
    }
    return out;
  });

  // Normalise to unit energy so all sizes sit at a similar loudness before the ConvolverNode's own scaling.
  let e = 0;
  for (const c of channels) for (const v of c) e += v * v;
  const g = 1 / Math.sqrt(e / 2);
  for (const c of channels) for (let i = 0; i < n; i++) c[i]! *= g;
  return [channels[0]!, channels[1]!];
}

/**
 * Reverberation time estimated from the Schroeder backward-integrated energy decay curve:
 * the time at which it first falls to −60 dB (extrapolated from the −5…−35 dB slope).
 */
export function measureRt60(ir: Float32Array, sampleRate: number): number {
  const edc = new Float64Array(ir.length);
  let acc = 0;
  for (let i = ir.length - 1; i >= 0; i--) edc[i] = acc += ir[i]! * ir[i]!;
  const total = edc[0]!;
  const db = (i: number) => 10 * Math.log10(edc[i]! / total + 1e-30);
  let i5 = 0;
  let i35 = 0;
  for (let i = 0; i < ir.length; i++) {
    if (!i5 && db(i) <= -5) i5 = i;
    if (!i35 && db(i) <= -35) {
      i35 = i;
      break;
    }
  }
  return ((i35 - i5) / sampleRate) * 2; // 30 dB of decay → ×2 for 60 dB
}
