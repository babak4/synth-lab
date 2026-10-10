/**
 * Spectral fingerprint for golden-render tests (plan T1.8). Compares spectral SHAPE and level with
 * tolerances rather than exact samples, so harmless browser/DSP differences do not break the build
 * but a real change in a preset's sound does. Pure: runs in Node and in the browser.
 */
import { peak, rms, spectrum, toDb } from '../analysis';

export const BAND_EDGES_HZ = [40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000] as const;
const FRAME = 16384;

export interface Fingerprint {
  /** Sample rate it was taken at (bands are in Hz, so this must match to compare). */
  sampleRate: number;
  rmsDb: number;
  peakDb: number;
  centroidHz: number;
  /** Power per band in dB (relative to full scale), one per gap in BAND_EDGES_HZ. */
  bandsDb: number[];
}

/**
 * Fingerprint the region `[start, start+length)` of `x`, averaging power over overlapping Hann frames
 * (Welch) so the result is stable for noisy sounds.
 */
export function fingerprint(x: ArrayLike<number>, sampleRate: number, start = 0, length = x.length - start): Fingerprint {
  const hop = FRAME / 2;
  const power = new Float64Array(FRAME / 2 + 1);
  let frames = 0;
  for (let at = start; at + FRAME <= start + length; at += hop) {
    const mag = spectrum(x, FRAME, at);
    for (let k = 0; k < mag.length; k++) power[k]! += mag[k]! * mag[k]!;
    frames++;
  }
  if (frames === 0) throw new Error(`fingerprint: need at least ${FRAME} samples, got ${length}`);
  for (let k = 0; k < power.length; k++) power[k]! /= frames;

  const binHz = sampleRate / FRAME;
  const bandPower = new Array<number>(BAND_EDGES_HZ.length - 1).fill(0);
  let total = 0;
  let weighted = 0;
  for (let k = 1; k < power.length; k++) {
    const f = k * binHz;
    total += power[k]!;
    weighted += power[k]! * f;
    for (let b = 0; b < bandPower.length; b++) {
      if (f >= BAND_EDGES_HZ[b]! && f < BAND_EDGES_HZ[b + 1]!) {
        bandPower[b]! += power[k]!;
        break;
      }
    }
  }
  const end = start + length;
  return {
    sampleRate,
    rmsDb: round(toDb(rms(x, start, end))),
    peakDb: round(toDb(peak(x, start, end))),
    centroidHz: Math.round(total > 0 ? weighted / total : 0),
    bandsDb: bandPower.map((p) => round(10 * Math.log10(p + 1e-18))),
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

export interface Tolerance {
  rmsDb: number;
  /** Fractional, e.g. 0.12 = ±12%. */
  centroid: number;
  bandDb: number;
  /** Bands quieter than this on BOTH sides are ignored (they are noise-floor). */
  floorDb: number;
}

export const DEFAULT_TOLERANCE: Tolerance = { rmsDb: 1.5, centroid: 0.12, bandDb: 3.5, floorDb: -75 };

/** Returns human-readable differences; empty means "matches". */
export function compareFingerprints(actual: Fingerprint, expected: Fingerprint, tol: Tolerance = DEFAULT_TOLERANCE): string[] {
  const problems: string[] = [];
  if (actual.sampleRate !== expected.sampleRate) problems.push(`sample rate ${actual.sampleRate} ≠ ${expected.sampleRate}`);
  if (Math.abs(actual.rmsDb - expected.rmsDb) > tol.rmsDb) problems.push(`level ${actual.rmsDb} dB vs ${expected.rmsDb} dB`);
  if (expected.centroidHz > 0 && Math.abs(actual.centroidHz / expected.centroidHz - 1) > tol.centroid) {
    problems.push(`brightness (centroid) ${actual.centroidHz} Hz vs ${expected.centroidHz} Hz`);
  }
  expected.bandsDb.forEach((e, i) => {
    const a = actual.bandsDb[i]!;
    if (Math.max(a, e) < tol.floorDb) return;
    if (Math.abs(a - e) > tol.bandDb) {
      problems.push(`band ${BAND_EDGES_HZ[i]}–${BAND_EDGES_HZ[i + 1]} Hz: ${a} dB vs ${e} dB`);
    }
  });
  return problems;
}
