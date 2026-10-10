import { describe, expect, it } from 'vitest';
import { additiveSample, beatEnvelope, beatHz, harmonicAmplitude, harmonicSeries, lowPassGain, unisonFrequencies } from './diagrams';

describe('harmonic amplitudes (PRD §4.5 correctness)', () => {
  it('sawtooth: every harmonic at 1/n', () => {
    expect(harmonicSeries('sawtooth', 5)).toEqual([1, 1 / 2, 1 / 3, 1 / 4, 1 / 5]);
  });
  it('square: odd harmonics only, at 1/n', () => {
    expect(harmonicSeries('square', 6)).toEqual([1, 0, 1 / 3, 0, 1 / 5, 0]);
  });
  it('triangle: odd harmonics only, at 1/n²', () => {
    expect(harmonicSeries('triangle', 6)).toEqual([1, 0, 1 / 9, 0, 1 / 25, 0]);
  });
  it('sine: the fundamental alone', () => {
    expect(harmonicSeries('sine', 4)).toEqual([1, 0, 0, 0]);
    expect(harmonicAmplitude('sine', 1)).toBe(1);
  });
  it('the series really builds the waveform: additive sum matches the ideal shapes', () => {
    // square: ±π/4 plateau; sawtooth: (π/2)·(1 − 2·phase)… compare shapes by sign and ratio instead of scale
    expect(additiveSample('square', 0.25, 400)).toBeGreaterThan(0);
    expect(additiveSample('square', 0.75, 400)).toBeLessThan(0);
    expect(additiveSample('square', 0.25, 400)).toBeCloseTo(-additiveSample('square', 0.75, 400), 6);
    const sawA = additiveSample('sawtooth', 0.25, 800);
    const sawB = additiveSample('sawtooth', 0.5, 800);
    expect(sawA / Math.abs(sawB === 0 ? 1 : sawB)).toBeGreaterThan(1); // falls through zero at phase 0.5
    expect(Math.abs(additiveSample('triangle', 0.25, 64))).toBeGreaterThan(Math.abs(additiveSample('triangle', 0.125, 64)));
    expect(additiveSample('triangle', 0.25, 64)).toBeCloseTo(-additiveSample('triangle', 0.75, 64), 6);
  });
});

describe('filter, beating, unison', () => {
  it('low-pass keeps harmonics below the cutoff and cuts those above, at 12 dB/octave', () => {
    expect(lowPassGain(1, 8)).toBeGreaterThan(0.99);
    expect(lowPassGain(8, 8)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(lowPassGain(32, 8)).toBeLessThan(0.07);
    expect(lowPassGain(16, 8) / lowPassGain(32, 8)).toBeGreaterThan(3.5); // ~4× per octave = 12 dB
  });
  it('beats at the difference of the two frequencies', () => {
    expect(beatHz(440, 442)).toBe(2);
    expect(beatEnvelope(440, 442, 0)).toBe(1);
    expect(beatEnvelope(440, 442, 0.25)).toBeCloseTo(0, 6); // first null at 1/(2Δf)
    expect(beatEnvelope(440, 442, 0.5)).toBeCloseTo(1, 6);
  });
  it('unison copies spread symmetrically around the centre in cents', () => {
    const f = unisonFrequencies(440, 5, 20);
    expect(f.length).toBe(5);
    expect(f[2]).toBeCloseTo(440, 9);
    expect(1200 * Math.log2(f[4]! / 440)).toBeCloseTo(20, 9);
    expect(1200 * Math.log2(f[0]! / 440)).toBeCloseTo(-20, 9);
    expect(unisonFrequencies(440, 1, 20)).toEqual([440]);
  });
});
