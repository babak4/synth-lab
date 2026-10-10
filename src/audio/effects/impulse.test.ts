import { describe, expect, it } from 'vitest';
import { IMPULSE_SPECS, generateImpulse, measureRt60, type ReverbSize } from './impulse';

const SR = 48000;
const sizes: ReverbSize[] = ['short', 'room', 'hall'];

describe('procedural impulse responses', () => {
  it.each(sizes)('%s: RT60 is within 15%% of the target', (size) => {
    const [l, r] = generateImpulse(size, SR);
    const target = IMPULSE_SPECS[size].rt60;
    for (const ch of [l, r]) expect(Math.abs(measureRt60(ch, SR) - target) / target).toBeLessThan(0.15);
  });

  it('sizes are strictly ordered short < room < hall in length and decay time', () => {
    const rt = sizes.map((s) => measureRt60(generateImpulse(s, SR)[0], SR));
    expect(rt[0]!).toBeLessThan(rt[1]!);
    expect(rt[1]!).toBeLessThan(rt[2]!);
    const len = sizes.map((s) => generateImpulse(s, SR)[0].length);
    expect(len[0]!).toBeLessThan(len[1]!);
    expect(len[1]!).toBeLessThan(len[2]!);
  });

  it('is deterministic, stereo-decorrelated, finite and unit-energy', () => {
    const a = generateImpulse('room', SR);
    const b = generateImpulse('room', SR);
    expect(a[0]).toEqual(b[0]);
    expect(a[1]).toEqual(b[1]);
    expect(a[0]).not.toEqual(a[1]);
    let dot = 0;
    let e0 = 0;
    let e1 = 0;
    let energy = 0;
    for (let i = 0; i < a[0].length; i++) {
      dot += a[0][i]! * a[1][i]!;
      e0 += a[0][i]! ** 2;
      e1 += a[1][i]! ** 2;
      energy += a[0][i]! ** 2 + a[1][i]! ** 2;
      expect(Number.isFinite(a[0][i]!)).toBe(true);
    }
    expect(Math.abs(dot / Math.sqrt(e0 * e1))).toBeLessThan(0.1); // correlation ≈ 0
    expect(energy / 2).toBeCloseTo(1, 3);
  });

  it('is silent during the pre-delay and the tail darkens over time', () => {
    const [l] = generateImpulse('hall', SR);
    const pre = Math.round(IMPULSE_SPECS.hall.preDelay * SR);
    for (let i = 0; i < pre; i++) expect(l[i]).toBe(0);
    const zc = (from: number, to: number) => {
      let n = 0;
      for (let i = from + 1; i < to; i++) if (l[i - 1]! * l[i]! < 0) n++;
      return n / ((to - from) / SR);
    };
    // Zero-crossing rate tracks spectral brightness: the late tail is lower than the early tail.
    expect(zc(Math.round(0.4 * SR), Math.round(0.6 * SR))).toBeGreaterThan(zc(Math.round(2.5 * SR), Math.round(2.7 * SR)));
  });
});
