import { describe, expect, it } from 'vitest';
import { BAND_EDGES_HZ, compareFingerprints, fingerprint } from './fingerprint';

const SR = 48000;
const tone = (hz: number, amp = 0.5, n = SR) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
const peakBand = (f: { bandsDb: number[] }) => f.bandsDb.indexOf(Math.max(...f.bandsDb));

describe('fingerprint', () => {
  it('puts a tone in the right band and reports level and brightness', () => {
    const f = fingerprint(tone(1200), SR);
    expect(peakBand(f)).toBe(BAND_EDGES_HZ.findIndex((e, i) => 1200 >= e && 1200 < BAND_EDGES_HZ[i + 1]!));
    expect(f.rmsDb).toBeCloseTo(-9, 0); // 0.5 amplitude sine
    expect(f.peakDb).toBeCloseTo(-6, 0);
    expect(Math.abs(f.centroidHz - 1200) / 1200).toBeLessThan(0.05);
  });

  it('distinguishes dark from bright sounds', () => {
    const dark = fingerprint(tone(200), SR);
    const bright = fingerprint(tone(5000), SR);
    expect(bright.centroidHz).toBeGreaterThan(dark.centroidHz * 10);
  });

  it('is stable across the analysed region (Welch averaging) and rejects a too-short region', () => {
    const a = fingerprint(tone(440, 0.5, SR * 2), SR, 0, SR);
    const b = fingerprint(tone(440, 0.5, SR * 2), SR, SR, SR);
    expect(compareFingerprints(a, b)).toEqual([]);
    expect(() => fingerprint(tone(440, 0.5, 1000), SR)).toThrow(/at least/);
  });
});

describe('compareFingerprints', () => {
  const base = fingerprint(tone(440), SR);
  it('accepts an identical or slightly quieter render, flags real differences', () => {
    expect(compareFingerprints(base, base)).toEqual([]);
    expect(compareFingerprints(fingerprint(tone(440, 0.45), SR), base)).toEqual([]); // −0.9 dB
    expect(compareFingerprints(fingerprint(tone(440, 0.25), SR), base).join()).toMatch(/level/); // −6 dB
    const moved = compareFingerprints(fingerprint(tone(3000), SR), base).join();
    expect(moved).toMatch(/brightness/);
    expect(moved).toMatch(/band/);
  });
  it('ignores bands below the noise floor on both sides', () => {
    const quiet = { ...base, bandsDb: base.bandsDb.map((b) => (b < -75 ? -100 : b)) };
    expect(compareFingerprints(quiet, base)).toEqual([]);
  });
  it('refuses to compare across sample rates', () => {
    expect(compareFingerprints({ ...base, sampleRate: 44100 }, base).join()).toMatch(/sample rate/);
  });
});
