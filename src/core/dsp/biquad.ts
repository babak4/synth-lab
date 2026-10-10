/**
 * Biquad magnitude response, matching the Web Audio BiquadFilterNode (RBJ cookbook, 12 dB/oct).
 * Used by the filter plot, which cannot touch audio nodes. A test cross-checks it against the real
 * node's getFrequencyResponse().
 *
 * `q` is the registry's LINEAR Q for every type. (The engine converts to dB for low/high-pass, where
 * Web Audio's Q is in dB; the resulting filter is the same.)
 */
export type BiquadType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

export function biquadMagnitude(type: BiquadType, cutoffHz: number, q: number, freqs: ArrayLike<number>, sampleRate: number): Float64Array {
  const f0 = Math.min(Math.max(cutoffHz, 1), sampleRate / 2 - 1);
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.max(q, 1e-3));

  let b0: number, b1: number, b2: number;
  switch (type) {
    case 'lowpass':
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = b0;
      break;
    case 'highpass':
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = b0;
      break;
    case 'bandpass':
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cos;
      b2 = 1;
      break;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;

  const out = new Float64Array(freqs.length);
  for (let i = 0; i < freqs.length; i++) {
    const w = (2 * Math.PI * freqs[i]!) / sampleRate;
    const c1 = Math.cos(w);
    const s1 = Math.sin(w);
    const c2 = Math.cos(2 * w);
    const s2 = Math.sin(2 * w);
    const nr = b0 + b1 * c1 + b2 * c2;
    const ni = -(b1 * s1 + b2 * s2);
    const dr = a0 + a1 * c1 + a2 * c2;
    const di = -(a1 * s1 + a2 * s2);
    out[i] = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  return out;
}

export const magnitudeToDb = (m: number): number => 20 * Math.log10(Math.max(m, 1e-6));

/** `n` log-spaced frequencies from `minHz` to `maxHz`. */
export function logFrequencies(n: number, minHz = 20, maxHz = 20000): Float64Array {
  return Float64Array.from({ length: n }, (_, i) => minHz * (maxHz / minHz) ** (i / (n - 1)));
}
