/**
 * Piano roll grid lines (plan T5.3a). One function turns the time signature, the visible tick range
 * and the zoom into bar, beat and sub-beat lines; the finer the zoom, the finer the lines, but never
 * closer together than MIN_LINE_PX so the grid reads as a grid at every zoom level.
 */
import { PPQ, ticksPerBar, type LoopRegion, type TimeSignature } from '../contracts/project';

export type GridLineKind = 'bar' | 'beat' | 'sub';

export interface GridLine {
  tick: number;
  kind: GridLineKind;
  /** Zero-based bar the line belongs to (a bar line starts that bar). */
  bar: number;
}

/** Finest spacing worth drawing. */
export const MIN_LINE_PX = 10;
/** Bar numbers never sit closer than this. */
export const MIN_LABEL_PX = 36;

/** The pulse: a quarter note in x/4, a dotted quarter (two per bar) in 6/8. */
export function beatTicks(sig: TimeSignature): number {
  return sig.denominator === 8 ? (PPQ * 3) / 2 : PPQ;
}

/** Candidate line spacings from the beat down to a 32nd note. Each divides the one before it and the bar. */
export function subdivisionChain(sig: TimeSignature): number[] {
  return sig.denominator === 8 ? [1440, 480, 240, 120] : [960, 480, 240, 120];
}

/**
 * Lines with from ≤ tick ≤ to, in order. The spacing is the finest subdivision that still leaves at
 * least MIN_LINE_PX between lines; when even beats would be closer than that, only bar lines remain.
 */
export function gridLines(sig: TimeSignature, fromTick: number, toTick: number, pxPerTick: number): GridLine[] {
  const bar = ticksPerBar(sig);
  const beat = beatTicks(sig);
  const fine = subdivisionChain(sig).filter((t) => t * pxPerTick >= MIN_LINE_PX);
  const step = fine.length > 0 ? fine[fine.length - 1]! : bar;
  const out: GridLine[] = [];
  const first = Math.max(0, Math.ceil(fromTick / step) * step);
  for (let tick = first; tick <= toTick; tick += step) {
    out.push({ tick, kind: tick % bar === 0 ? 'bar' : tick % beat === 0 ? 'beat' : 'sub', bar: Math.floor(tick / bar) });
  }
  return out;
}

/** Show a bar number every n bars, n a power of two, so labels stay readable when zoomed out. */
export function barLabelStep(sig: TimeSignature, pxPerTick: number): number {
  const barPx = ticksPerBar(sig) * pxPerTick;
  let n = 1;
  while (n * barPx < MIN_LABEL_PX && n < 64) n *= 2;
  return n;
}

/** The loop as a tick span (end exclusive). */
export function loopSpan(loop: LoopRegion, sig: TimeSignature): { startTick: number; endTick: number } {
  const bar = ticksPerBar(sig);
  return { startTick: loop.startBar * bar, endTick: loop.endBar * bar };
}
