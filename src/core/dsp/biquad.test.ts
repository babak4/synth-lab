import { describe, expect, it } from 'vitest';
import { biquadMagnitude, logFrequencies, magnitudeToDb } from './biquad';

const SR = 48000;
const db = (type: Parameters<typeof biquadMagnitude>[0], fc: number, q: number, f: number) =>
  magnitudeToDb(biquadMagnitude(type, fc, q, [f], SR)[0]!);

describe('biquad magnitude', () => {
  it('low-pass: unity well below cutoff, −3 dB at cutoff for Butterworth Q, 12 dB/octave above', () => {
    const q = Math.SQRT1_2;
    expect(db('lowpass', 1000, q, 50)).toBeCloseTo(0, 1);
    expect(db('lowpass', 1000, q, 1000)).toBeCloseTo(-3.01, 1);
    // two octaves above ≈ −24 dB (12 dB/octave)
    expect(db('lowpass', 1000, q, 4000)).toBeLessThan(-22);
    expect(db('lowpass', 1000, q, 4000)).toBeGreaterThan(-26);
  });

  it('high-pass mirrors it', () => {
    const q = Math.SQRT1_2;
    expect(db('highpass', 1000, q, 15000)).toBeCloseTo(0, 1);
    expect(db('highpass', 1000, q, 1000)).toBeCloseTo(-3.01, 1);
    expect(db('highpass', 1000, q, 250)).toBeLessThan(-22);
  });

  it('band-pass peaks at 0 dB at the centre and notch dips at the centre', () => {
    expect(db('bandpass', 2000, 4, 2000)).toBeCloseTo(0, 1);
    expect(db('bandpass', 2000, 4, 200)).toBeLessThan(-20);
    expect(db('notch', 2000, 4, 2000)).toBeLessThan(-60);
    expect(db('notch', 2000, 4, 200)).toBeCloseTo(0, 1);
  });

  it('resonance raises a peak at the cutoff: Q 10 gives about +20 dB on a low-pass', () => {
    expect(db('lowpass', 1000, 10, 1000)).toBeGreaterThan(19);
    expect(db('lowpass', 1000, 10, 1000)).toBeLessThan(21);
  });

  it('survives extreme cutoffs', () => {
    for (const fc of [1, 20, 20000, 30000]) for (const t of ['lowpass', 'highpass', 'bandpass', 'notch'] as const) {
      const m = biquadMagnitude(t, fc, 5, logFrequencies(16), SR);
      expect([...m].every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
    }
  });

  it('logFrequencies spans the range evenly in octaves', () => {
    const f = logFrequencies(11, 20, 20480);
    expect(f[0]).toBeCloseTo(20, 9);
    expect(f[10]).toBeCloseTo(20480, 6);
    expect(f[1]! / f[0]!).toBeCloseTo(f[2]! / f[1]!, 9);
  });
});
