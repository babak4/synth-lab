import { describe, expect, it } from 'vitest';
import { toneAmplitude, amplitudeAt, dominantFrequency, fft, findClicks, firstAbove, fromDb, lastAbove, maxStep, peak, rms, spectrum, toDb } from './analysis';

const SR = 48000;
const sine = (hz: number, n: number, amp = 1) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));

describe('level measures', () => {
  it('peak and rms of a full-scale sine', () => {
    const x = sine(1000, SR);
    expect(peak(x)).toBeCloseTo(1, 3);
    expect(rms(x)).toBeCloseTo(Math.SQRT1_2, 3);
  });
  it('dB conversions round-trip', () => {
    expect(toDb(0.5)).toBeCloseTo(-6.0206, 3);
    expect(fromDb(-12)).toBeCloseTo(0.2512, 3);
    expect(toDb(0)).toBe(-240);
  });
  it('firstAbove / lastAbove locate a burst', () => {
    const x = new Float32Array(100);
    x[30] = 0.5;
    x[70] = -0.5;
    expect(firstAbove(x, 0.1)).toBe(30);
    expect(lastAbove(x, 0.1)).toBe(70);
    expect(firstAbove(new Float32Array(10), 0.1)).toBe(-1);
  });
});

describe('click detection', () => {
  it('finds no clicks in a clean sine and one at a hard jump', () => {
    const natural = (2 * Math.PI * 440) / SR;
    const x = sine(440, 4800);
    expect(maxStep(x)).toBeLessThan(natural * 1.01);
    expect(findClicks(x, natural * 2)).toEqual([]);
    for (let i = 2400; i < x.length; i++) x[i] = x[i]! + 0.5; // DC step = discontinuity
    expect(findClicks(x, natural * 2)).toEqual([2400]);
  });
});

describe('fft', () => {
  it('matches a naive DFT on random input', () => {
    const n = 64;
    const x = Float64Array.from({ length: n }, () => Math.random() - 0.5);
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft(re, im);
    for (const k of [0, 1, 5, 17, 32]) {
      let r = 0;
      let i = 0;
      for (let t = 0; t < n; t++) {
        r += x[t]! * Math.cos((2 * Math.PI * k * t) / n);
        i -= x[t]! * Math.sin((2 * Math.PI * k * t) / n);
      }
      expect(re[k]).toBeCloseTo(r, 9);
      expect(im[k]).toBeCloseTo(i, 9);
    }
  });
  it('rejects non-power-of-two sizes', () => {
    expect(() => fft(new Float64Array(10), new Float64Array(10))).toThrow();
  });
});

describe('spectrum', () => {
  it('reads a bin-centred full-scale sine as ≈ 1.0', () => {
    const size = 8192;
    const hz = (100 * SR) / size;
    const mag = spectrum(sine(hz, size), size);
    expect(mag[100]).toBeCloseTo(1, 2);
  });
  it('finds the dominant frequency of an off-bin tone within 0.1%', () => {
    for (const hz of [110, 261.63, 440, 1234.5, 4000]) {
      const f = dominantFrequency(sine(hz, 32768), SR, { size: 16384 });
      expect(Math.abs(f - hz) / hz, `${hz}`).toBeLessThan(0.001);
    }
  });
  it('reports harmonic amplitudes of a two-tone signal', () => {
    const size = 16384;
    const a = sine(1500, size, 1);
    const b = sine(3000, size, 0.25);
    const mix = a.map((v, i) => v + b[i]!);
    const mag = spectrum(mix, size);
    expect(amplitudeAt(mag, SR, size, 1500)).toBeCloseTo(1, 1);
    expect(amplitudeAt(mag, SR, size, 3000)).toBeCloseTo(0.25, 1);
  });
});

describe('toneAmplitude', () => {
  it('is exact for whole-period windows, including harmonics of a periodic signal', () => {
    const f0 = 480; // 100 samples per period at 48 kHz
    const x = Float32Array.from({ length: 4800 }, (_, i) => 0.7 * Math.sin((2 * Math.PI * f0 * i) / SR) + 0.2 * Math.sin((2 * Math.PI * 3 * f0 * i) / SR));
    expect(toneAmplitude(x, SR, f0)).toBeCloseTo(0.7, 6);
    expect(toneAmplitude(x, SR, 3 * f0)).toBeCloseTo(0.2, 6);
    expect(toneAmplitude(x, SR, 2 * f0)).toBeCloseTo(0, 6);
  });
});
