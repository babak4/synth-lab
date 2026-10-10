import { describe, expect, it } from 'vitest';
import { centroidAt, centroidSeries, highShare, mean, modulationFrequency, rmsSeries, stdDev } from './measure';

const SR = 48000;
const tone = (hz: number, n: number, amp = 1) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

describe('measure', () => {
  it('rmsSeries follows an amplitude-modulated tone and modulationFrequency finds the rate and depth', () => {
    const n = SR * 4;
    const x = Float32Array.from({ length: n }, (_, i) => (0.6 + 0.3 * Math.sin((2 * Math.PI * 5 * i) / SR)) * Math.sin((2 * Math.PI * 440 * i) / SR));
    const m = modulationFrequency(rmsSeries(x, SR, 10), 1, 12);
    expect(m.hz).toBeCloseTo(5, 0);
    expect(m.depth).toBeCloseTo(0.5, 1); // 0.3 / 0.6
  });

  it('finds no meaningful modulation in a steady tone', () => {
    const m = modulationFrequency(rmsSeries(tone(440, SR * 3), SR, 10), 1, 12);
    expect(m.depth).toBeLessThan(0.02);
  });

  it('centroid tells a low tone from a high one and tracks a sweep', () => {
    expect(centroidAt(tone(300, 8192), SR, 0)).toBeCloseTo(300, -1);
    expect(centroidAt(tone(3000, 8192), SR, 0)).toBeGreaterThan(2800);
    const sweep = Float32Array.from({ length: SR * 2 }, (_, i) => Math.sin(2 * Math.PI * (200 * (i / SR) + 800 * (i / SR) ** 2)));
    const c = centroidSeries(sweep, SR, 2048).values;
    expect(c.at(-1)!).toBeGreaterThan(c[0]! * 4);
  });

  it('highShare separates dark from bright, even when a low fundamental dominates the centroid', () => {
    const dark = tone(80, 8192);
    const bright = Float32Array.from(dark, (v, i) => v + 0.3 * Math.sin((2 * Math.PI * 2000 * i) / SR));
    expect(highShare(dark, SR, 0, 400)).toBeLessThan(0.001);
    expect(highShare(bright, SR, 0, 400)).toBeGreaterThan(0.05);
    expect(centroidAt(bright, SR, 0)).toBeLessThan(400); // the centroid barely notices the 2 kHz partial
  });

  it('mean and stdDev', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(stdDev([2, 2, 2])).toBe(0);
    expect(stdDev([1, 3])).toBe(1);
  });
});
