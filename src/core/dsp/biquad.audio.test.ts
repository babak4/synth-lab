import { describe, expect, it } from 'vitest';
import { biquadMagnitude, logFrequencies, magnitudeToDb, type BiquadType } from './biquad';

const SR = 48000;

/** The browser's own answer for the same filter, using the same Q convention the engine applies. */
function nativeDb(type: BiquadType, cutoff: number, qLinear: number, freqs: Float32Array<ArrayBuffer>) {
  const ctx = new OfflineAudioContext(1, 128, SR);
  // Web Audio's Q is in dB for low/high-pass and linear for band-pass/notch (see Voice.filterQ).
  const q = type === 'lowpass' || type === 'highpass' ? 20 * Math.log10(qLinear) : qLinear;
  const f = new BiquadFilterNode(ctx, { type, frequency: cutoff, Q: q });
  const mag = new Float32Array(freqs.length);
  const phase = new Float32Array(freqs.length);
  f.getFrequencyResponse(freqs, mag, phase);
  return Array.from(mag, (m) => magnitudeToDb(m));
}

describe('pure biquad response matches the browser BiquadFilterNode', () => {
  const freqs = Float32Array.from(logFrequencies(96)) as Float32Array<ArrayBuffer>;
  const types: BiquadType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];
  const cases: [number, number][] = [[200, 0.7], [1000, 1], [4000, 6], [8000, 12], [15000, 20], [60, 3]];

  it.each(types.flatMap((t) => cases.map(([fc, q]) => [t, fc, q] as const)))('%s @ %i Hz, Q %f', (type, fc, q) => {
    const native = nativeDb(type, fc, q, freqs);
    const ours = Array.from(biquadMagnitude(type, fc, q, freqs, SR), magnitudeToDb);
    let worst = 0;
    freqs.forEach((_, i) => {
      // Skip the deep notch floor, where both sides are numerically meaningless.
      if (native[i]! < -80 && ours[i]! < -80) return;
      worst = Math.max(worst, Math.abs(native[i]! - ours[i]!));
    });
    expect(worst).toBeLessThan(0.05);
  });
});
