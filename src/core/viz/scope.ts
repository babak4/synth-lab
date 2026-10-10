/**
 * Oscilloscope helpers (plan T2.3). The trace is "triggered": it starts at a rising zero-crossing so a
 * held note's waveform stands still instead of scrolling.
 */

/**
 * Index of the first rising zero-crossing in `[0, searchLen)`, or 0 if there is none (silence, or a
 * signal that never crosses). A small hysteresis stops noise around zero from triggering early:
 * the signal must first dip below -`hysteresis` before a crossing counts.
 */
export function findTrigger(samples: ArrayLike<number>, searchLen: number, hysteresis = 0.01): number {
  const end = Math.min(searchLen, samples.length - 1);
  let armed = false;
  for (let i = 0; i < end; i++) {
    const v = samples[i]!;
    if (v < -hysteresis) armed = true;
    else if (armed && v >= 0 && samples[i - 1]! < 0) return i;
  }
  return 0;
}

/**
 * Sub-sample position of the first rising zero-crossing (linear interpolation between the two samples
 * either side of zero), or null if there is none. Drawing at this exact offset removes the half-pixel
 * shimmer you get from snapping the trigger to a whole sample.
 */
export function findTriggerExact(samples: ArrayLike<number>, searchLen: number, hysteresis = 0.01): number | null {
  const i = findTrigger(samples, searchLen, hysteresis);
  if (i === 0) return null;
  const a = samples[i - 1]!;
  const b = samples[i]!;
  return i - 1 + (b === a ? 0 : -a / (b - a));
}

/** Samples in one period of `hz`. */
export const periodSamples = (hz: number, sampleRate: number): number => sampleRate / Math.max(hz, 1);

export interface ScopeTrace {
  /** Integer index to start reading from (the sample just before the trigger crossing). */
  start: number;
  /** Fractional distance (0–1) from `start` to the exact crossing; draw sample j at x = j − offset. */
  offset: number;
  /** Number of samples to draw. */
  length: number;
}

/**
 * Pick the slice to draw: `periods` cycles of the latest note starting at a trigger point.
 * Falls back to a fixed window when no pitch is known (e.g. noise or a chord with no single period).
 */
export function scopeTrace(samples: ArrayLike<number>, sampleRate: number, hz: number | null, periods = 3): ScopeTrace {
  const n = samples.length;
  const p = hz ? periodSamples(hz, sampleRate) : n / 4;
  const length = Math.min(Math.round(p * periods), n >> 1);
  // Search one full period for the trigger so there is always `length` samples left after it.
  const pos = findTriggerExact(samples, Math.min(Math.round(p), n - length - 1));
  if (pos === null) return { start: 0, offset: 0, length };
  const start = Math.floor(pos);
  return { start, offset: pos - start, length: Math.min(length, n - start) };
}
