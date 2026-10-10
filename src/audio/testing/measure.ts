/**
 * Higher-level measurements over rendered audio (plan T1.8 / T2.5): how loud, how bright, and how
 * fast it is changing. Pure; used to prove that a preset's concept is audible, not just configured.
 */
import { rms, spectrum } from '../analysis';

export interface Series {
  /** One value per window. */
  values: number[];
  /** Windows per second. */
  rate: number;
}

/** Apply `fn` to successive windows of `x`. */
export function windowed(x: ArrayLike<number>, sampleRate: number, size: number, hop: number, from = 0, to = x.length, fn: (start: number) => number): Series {
  const values: number[] = [];
  for (let s = from; s + size <= to; s += hop) values.push(fn(s));
  return { values, rate: sampleRate / hop };
}

export const rmsSeries = (x: ArrayLike<number>, sr: number, windowMs = 20, from = 0, to = x.length): Series => {
  const size = Math.round((sr * windowMs) / 1000);
  return windowed(x, sr, size, size, from, to, (s) => rms(x, s, s + size));
};

/** Spectral centroid (Hz) of the window at `start`, over 40 Hz – 16 kHz. */
export function centroidAt(x: ArrayLike<number>, sr: number, start: number, size = 4096): number {
  const mag = spectrum(x, size, start);
  const binHz = sr / size;
  let num = 0;
  let den = 0;
  for (let k = Math.ceil(40 / binHz); k < Math.min(mag.length, Math.floor(16000 / binHz)); k++) {
    const p = mag[k]! * mag[k]!;
    num += p * k * binHz;
    den += p;
  }
  return den > 0 ? num / den : 0;
}

export const centroidSeries = (x: ArrayLike<number>, sr: number, hop = 1024, from = 0, to = x.length, size = 4096): Series =>
  windowed(x, sr, size, hop, from, to, (s) => centroidAt(x, sr, s, size));

/**
 * Strongest periodic component of a series between `minHz` and `maxHz` (single-bin DFTs on a fine
 * grid, DC removed). Returns its frequency and its amplitude relative to the series mean.
 */
export function modulationFrequency(series: Series, minHz: number, maxHz: number, steps = 400): { hz: number; depth: number } {
  const v = series.values;
  const mean = v.reduce((s, a) => s + a, 0) / v.length;
  let best = { hz: 0, depth: 0 };
  for (let i = 0; i <= steps; i++) {
    const hz = minHz + ((maxHz - minHz) * i) / steps;
    let re = 0;
    let im = 0;
    for (let k = 0; k < v.length; k++) {
      const t = k / series.rate;
      re += (v[k]! - mean) * Math.cos(2 * Math.PI * hz * t);
      im -= (v[k]! - mean) * Math.sin(2 * Math.PI * hz * t);
    }
    const amp = (2 * Math.hypot(re, im)) / v.length;
    if (amp > best.depth * mean || best.hz === 0) best = { hz, depth: mean > 0 ? amp / mean : 0 };
  }
  return best;
}

export const mean = (v: number[]): number => v.reduce((s, a) => s + a, 0) / v.length;
export const stdDev = (v: number[]): number => {
  const m = mean(v);
  return Math.sqrt(mean(v.map((a) => (a - m) ** 2)));
};

/** Fraction of spectral power above `cutHz` in the window at `start` (0 = all low, 1 = all high). */
export function highShare(x: ArrayLike<number>, sr: number, start: number, cutHz: number, size = 4096): number {
  const mag = spectrum(x, size, start);
  const cut = Math.round((cutHz * size) / sr);
  let hi = 0;
  let all = 0;
  for (let k = 1; k < mag.length; k++) {
    const p = mag[k]! * mag[k]!;
    all += p;
    if (k >= cut) hi += p;
  }
  return all > 0 ? hi / all : 0;
}
