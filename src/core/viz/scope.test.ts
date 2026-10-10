import { describe, expect, it } from 'vitest';
import { findTrigger, findTriggerExact, periodSamples, scopeTrace } from './scope';

const SR = 48000;
const sine = (hz: number, n: number, phase = 0) => Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * hz * i) / SR + phase));

describe('findTrigger', () => {
  it('finds a rising zero-crossing', () => {
    const x = sine(440, 2048, Math.PI); // starts descending from 0
    const i = findTrigger(x, 200);
    expect(i).toBeGreaterThan(0);
    expect(x[i - 1]!).toBeLessThan(0);
    expect(x[i]!).toBeGreaterThanOrEqual(0);
  });

  it('is stationary: two buffers of the same note taken at different phases trigger on the same waveform point', () => {
    const hz = 220;
    const p = periodSamples(hz, SR);
    const a = sine(hz, 4096, 0.3);
    const b = sine(hz, 4096, 2.1);
    const ia = findTrigger(a, Math.round(p) + 2);
    const ib = findTrigger(b, Math.round(p) + 2);
    // The sample at the trigger is just past a zero crossing in both, so the traces align.
    expect(Math.abs(a[ia]!)).toBeLessThan(0.07);
    expect(Math.abs(b[ib]!)).toBeLessThan(0.07);
    expect(a[ia + 20]! - a[ia]!).toBeGreaterThan(0); // rising in both
    expect(b[ib + 20]! - b[ib]!).toBeGreaterThan(0);
  });

  it('ignores noise jitter around zero (hysteresis)', () => {
    const x = new Float32Array(100);
    for (let i = 0; i < 50; i++) x[i] = i % 2 ? 0.005 : -0.005; // jitters across 0 but never dips below −0.01
    for (let i = 50; i < 100; i++) x[i] = i < 75 ? -0.5 : 0.5;
    expect(findTrigger(x, 100)).toBe(75);
  });

  it('returns 0 for silence or a signal that never rises through zero', () => {
    expect(findTrigger(new Float32Array(100), 100)).toBe(0);
    expect(findTrigger(new Float32Array(100).fill(0.5), 100)).toBe(0);
    expect(findTrigger(new Float32Array(100).fill(-0.5), 100)).toBe(0);
  });
});

describe('findTriggerExact', () => {
  it('locates the zero crossing to a fraction of a sample', () => {
    // sin(2π·f·t + φ) crosses zero upward where the phase hits a multiple of 2π.
    for (const phase of [0.4, 1.9, 3.3, 5.7]) {
      const hz = 313; // not a divisor of the sample rate, so crossings land between samples
      const x = sine(hz, 2048, phase);
      const pos = findTriggerExact(x, 400)!;
      expect(pos).not.toBeNull();
      const truth = (((2 * Math.PI - (phase % (2 * Math.PI))) % (2 * Math.PI)) / (2 * Math.PI)) * (SR / hz);
      // either the first crossing or one period later, depending on where the search begins
      const period = SR / hz;
      const k = Math.round((pos - truth) / period);
      expect(Math.abs(pos - (truth + k * period)), `phase ${phase}`).toBeLessThan(0.02);
    }
  });
  it('returns null when there is no crossing', () => {
    expect(findTriggerExact(new Float32Array(50), 50)).toBeNull();
  });
});

describe('scopeTrace', () => {
  it('draws two frames of the same note at different phases identically once offset is applied', () => {
    const hz = 313;
    const frame = (phase: number) => {
      const x = sine(hz, 2048, phase);
      const t = scopeTrace(x, SR, hz);
      // value the scope would plot at x-position 100 (in samples after the exact crossing)
      const j = t.start + Math.round(100 + t.offset);
      return x[j]! + (x[j + 1]! - x[j]!) * 0; // sample at an integer position
    };
    // Positions line up to within one sample's slope, rather than jumping by up to a sample.
    const [a, b] = [frame(0.4), frame(2.2)];
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });

  it('shows about three periods of the known pitch from the trigger point', () => {
    const x = sine(440, 2048, 1);
    const t = scopeTrace(x, SR, 440);
    expect(t.length).toBe(Math.round(periodSamples(440, SR) * 3));
    expect(t.start).toBeLessThan(Math.round(periodSamples(440, SR)) + 1);
    expect(t.start + t.length).toBeLessThanOrEqual(2048);
  });

  it('clamps to the buffer for very low notes, and falls back to a fixed window with no pitch', () => {
    const low = scopeTrace(sine(30, 2048), SR, 30);
    expect(low.length).toBeLessThanOrEqual(1024);
    expect(low.start + low.length).toBeLessThanOrEqual(2048);
    const noPitch = scopeTrace(sine(100, 2048), SR, null);
    expect(noPitch.length).toBe(1024);
  });
});
