/** Spectrum analyser geometry (plan T2.3): log frequency axis, dB scale, musical gridlines. */
import { mtof, noteName } from '../pitch';

export const SPECTRUM_MIN_HZ = 20;
export const SPECTRUM_MAX_HZ = 20000;

/** Frequency → 0–1 position on a log axis. */
export function freqToX(hz: number, minHz = SPECTRUM_MIN_HZ, maxHz = SPECTRUM_MAX_HZ): number {
  const c = Math.min(maxHz, Math.max(minHz, hz));
  return Math.log(c / minHz) / Math.log(maxHz / minHz);
}

export function xToFreq(x: number, minHz = SPECTRUM_MIN_HZ, maxHz = SPECTRUM_MAX_HZ): number {
  return minHz * (maxHz / minHz) ** Math.min(1, Math.max(0, x));
}

/** dB → 0 (bottom) … 1 (top). */
export function dbToY(db: number, minDb = -100, maxDb = -20): number {
  if (!Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db - minDb) / (maxDb - minDb)));
}

/**
 * Collapse FFT bins into `columns` log-spaced columns, keeping the loudest bin in each (so narrow
 * harmonics stay visible when many bins share a column at high frequencies). Low frequencies, where a
 * single bin spans many columns, are linearly interpolated so the trace is continuous.
 */
export function binsToColumns(db: ArrayLike<number>, sampleRate: number, columns: number, minHz = SPECTRUM_MIN_HZ, maxHz = SPECTRUM_MAX_HZ): Float32Array {
  const out = new Float32Array(columns).fill(-Infinity);
  const binHz = sampleRate / 2 / db.length;
  for (let c = 0; c < columns; c++) {
    const lo = xToFreq(c / columns, minHz, maxHz);
    const hi = xToFreq((c + 1) / columns, minHz, maxHz);
    const b0 = lo / binHz;
    const b1 = hi / binHz;
    if (b1 - b0 < 1) {
      // Sub-bin column: interpolate between the two nearest bins at the column centre.
      const pos = (b0 + b1) / 2;
      const i = Math.min(db.length - 2, Math.max(0, Math.floor(pos)));
      const f = pos - i;
      const a = db[i]!;
      const b = db[i + 1]!;
      out[c] = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * f : Math.max(a, b);
    } else {
      let m = -Infinity;
      for (let i = Math.max(0, Math.floor(b0)); i <= Math.min(db.length - 1, Math.ceil(b1)); i++) m = Math.max(m, db[i]!);
      out[c] = m;
    }
  }
  return out;
}

export interface GridLine {
  x: number;
  label: string;
  /** Octave Cs and decade marks get stronger lines than the rest. */
  strong: boolean;
}

/** Octave C's (C1…C9 range that fits) labelled with note names, plus decade marks in Hz. */
export function spectrumGrid(a4 = 440): GridLine[] {
  const lines: GridLine[] = [];
  for (let pitch = 24; pitch <= 120; pitch += 12) {
    const hz = mtof(pitch, a4);
    if (hz < SPECTRUM_MIN_HZ || hz > SPECTRUM_MAX_HZ) continue;
    lines.push({ x: freqToX(hz), label: noteName(pitch), strong: false });
  }
  for (const hz of [100, 1000, 10000]) lines.push({ x: freqToX(hz), label: hz >= 1000 ? `${hz / 1000}k` : `${hz}`, strong: true });
  return lines.sort((p, q) => p.x - q.x);
}

/**
 * Choose which gridline labels fit. Decade marks (100, 1k, 10k) take priority over note names; a label
 * is dropped if it would overlap one already placed. `widthPx` is the plot width, `labelPx` an
 * estimate of one label's width.
 */
export function visibleLabels(grid: GridLine[], widthPx: number, labelPx = 24, gapPx = 6): Set<GridLine> {
  const placed: { from: number; to: number }[] = [];
  const keep = new Set<GridLine>();
  const fits = (g: GridLine) => {
    const from = g.x * widthPx;
    const to = from + Math.max(labelPx, g.label.length * 6.5);
    return placed.every((p) => to + gapPx <= p.from || from >= p.to + gapPx);
  };
  for (const strong of [true, false]) {
    for (const g of grid) {
      if (g.strong !== strong || !fits(g)) continue;
      const from = g.x * widthPx;
      placed.push({ from, to: from + Math.max(labelPx, g.label.length * 6.5) });
      keep.add(g);
    }
  }
  return keep;
}
