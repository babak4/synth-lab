/**
 * Pure signal-analysis helpers (no Web Audio). Used by the master meter and by every audio test.
 * Runs in Node and in the browser.
 */

export { fromDb, toDb } from '@/core/db';

export function peak(x: ArrayLike<number>, from = 0, to = x.length): number {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(x[i]!));
  return p;
}

export function rms(x: ArrayLike<number>, from = 0, to = x.length): number {
  if (to <= from) return 0;
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / (to - from));
}

/** Largest sample-to-sample step in [from, to). A discontinuity (click) shows up as an outlier here. */
export function maxStep(x: ArrayLike<number>, from = 1, to = x.length): number {
  let m = 0;
  for (let i = Math.max(from, 1); i < to; i++) m = Math.max(m, Math.abs(x[i]! - x[i - 1]!));
  return m;
}

/**
 * Positions where the step between samples exceeds `threshold`.
 * Pick a threshold well above the signal's natural slope (2π·f·A / sampleRate for a sine).
 */
export function findClicks(x: ArrayLike<number>, threshold: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < x.length; i++) if (Math.abs(x[i]! - x[i - 1]!) > threshold) out.push(i);
  return out;
}

/** RMS per consecutive window, for envelope-shape and timing assertions. */
export function rmsWindows(x: ArrayLike<number>, windowSamples: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + windowSamples <= x.length; i += windowSamples) out.push(rms(x, i, i + windowSamples));
  return out;
}

/** First sample index where |x| exceeds `threshold`, or -1. */
export function firstAbove(x: ArrayLike<number>, threshold: number): number {
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) > threshold) return i;
  return -1;
}

/** Last sample index where |x| exceeds `threshold`, or -1. */
export function lastAbove(x: ArrayLike<number>, threshold: number): number {
  for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]!) > threshold) return i;
  return -1;
}

// ─── FFT ───────────────────────────────────────────────────────────────────────────────────

export const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;

/** In-place iterative radix-2 FFT. `re`/`im` lengths must be equal powers of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (!isPow2(n) || im.length !== n) throw new Error('fft: length must be a power of two');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

/**
 * Single-sided amplitude spectrum (bins 0..N/2) of `x[start .. start+size)` with a Hann window,
 * scaled so a full-scale sine centred on a bin reads ≈ 1.0 (0 dBFS).
 */
export function spectrum(x: ArrayLike<number>, size: number, start = 0): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let wsum = 0;
  for (let i = 0; i < size; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
    re[i] = (x[start + i] ?? 0) * w;
    wsum += w;
  }
  fft(re, im);
  const out = new Float64Array(size / 2 + 1);
  for (let k = 0; k < out.length; k++) out[k] = (2 * Math.hypot(re[k]!, im[k]!)) / wsum;
  return out;
}

/** Frequency (Hz) of the strongest spectral peak, with parabolic interpolation between bins. */
export function dominantFrequency(
  x: ArrayLike<number>,
  sampleRate: number,
  opts: { size?: number; start?: number; minHz?: number; maxHz?: number } = {},
): number {
  const size = opts.size ?? 16384;
  const mag = spectrum(x, size, opts.start ?? 0);
  const binHz = sampleRate / size;
  const lo = Math.max(1, Math.floor((opts.minHz ?? 20) / binHz));
  const hi = Math.min(mag.length - 2, Math.ceil((opts.maxHz ?? sampleRate / 2) / binHz));
  let best = lo;
  for (let k = lo; k <= hi; k++) if (mag[k]! > mag[best]!) best = k;
  const a = Math.log(mag[best - 1]! + 1e-20);
  const b = Math.log(mag[best]! + 1e-20);
  const c = Math.log(mag[best + 1]! + 1e-20);
  const denom = a - 2 * b + c;
  const shift = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
  return (best + shift) * binHz;
}

/** Amplitude near `hz` (max of ±1 bin), for harmonic-level assertions. */
export function amplitudeAt(mag: Float64Array, sampleRate: number, size: number, hz: number): number {
  const k = Math.round((hz * size) / sampleRate);
  return Math.max(mag[k - 1] ?? 0, mag[k] ?? 0, mag[k + 1] ?? 0);
}

/**
 * Exact amplitude of the component at `hz` using a rectangular-window DFT. Only leakage-free when
 * `length` covers a whole number of periods of every component present; choose f0 so that
 * sampleRate/f0 is an integer (e.g. 480 Hz at 48 kHz) for periodic test signals.
 */
export function toneAmplitude(x: ArrayLike<number>, sampleRate: number, hz: number, start = 0, length = x.length - start): number {
  let re = 0;
  let im = 0;
  const w = (2 * Math.PI * hz) / sampleRate;
  for (let i = 0; i < length; i++) {
    const v = x[start + i]!;
    re += v * Math.cos(w * i);
    im -= v * Math.sin(w * i);
  }
  return (2 * Math.hypot(re, im)) / length;
}
