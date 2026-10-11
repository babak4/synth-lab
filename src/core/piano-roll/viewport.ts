/**
 * Piano roll viewport maths (plan T5.3a). Pure: ticks and pitches on one side, CSS pixels of the grid
 * area on the other. The viewport is two scroll offsets and two zoom factors; nothing here knows about
 * the DOM, canvas or stores, so every rule is unit-tested in Node.
 *
 * Horizontal position is kept in ticks (zoom-independent), vertical in pixels from the top of the
 * 128-row pitch strip. Row 0 is the highest pitch (127), as on a piano drawn upright.
 */
import { PPQ, ticksPerBar, type Note, type TimeSignature } from '../contracts/project';

export const PITCH_MIN = 0;
export const PITCH_MAX = 127;
export const PITCH_COUNT = PITCH_MAX - PITCH_MIN + 1;

export const PX_PER_TICK_MAX = 0.5; // a quarter note is 480 px
export const PX_PER_TICK_FLOOR = 0.004; // never smaller, whatever the song length
export const ROW_HEIGHT_MIN = 6;
export const ROW_HEIGHT_MAX = 32;
export const DEFAULT_PX_PER_TICK = 0.1; // a 4/4 bar is 384 px
export const DEFAULT_ROW_HEIGHT = 16;
export const DEFAULT_CENTRE_PITCH = 60;
/** One button press or key press scales by this much. */
export const ZOOM_STEP = 1.25;

export interface Viewport {
  /** Tick at the left edge of the grid. */
  scrollTick: number;
  /** Pixels scrolled down from the top of pitch 127's row. */
  scrollY: number;
  pxPerTick: number;
  /** Pixels per semitone. */
  rowHeight: number;
}

/** The grid area in CSS pixels (excluding the key column and ruler). */
export interface Size {
  width: number;
  height: number;
}

export interface VisibleRange {
  tickFrom: number;
  tickTo: number;
  /** Lowest and highest pitch with any part on screen, clamped to 0–127. */
  pitchLo: number;
  pitchHi: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

// ---------------------------------------------------------------------------------------------
// Coordinate conversion (grid-area pixels)
// ---------------------------------------------------------------------------------------------

export const tickToX = (vp: Viewport, tick: number): number => (tick - vp.scrollTick) * vp.pxPerTick;
export const xToTick = (vp: Viewport, x: number): number => vp.scrollTick + x / vp.pxPerTick;

/** Top edge of a pitch's row. */
export const pitchToY = (vp: Viewport, pitch: number): number => (PITCH_MAX - pitch) * vp.rowHeight - vp.scrollY;

/** The pitch whose row contains y, clamped to the keyboard. */
export function yToPitch(vp: Viewport, y: number): number {
  return clamp(PITCH_MAX - Math.floor((y + vp.scrollY) / vp.rowHeight), PITCH_MIN, PITCH_MAX);
}

// ---------------------------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------------------------

/** Length of the scrollable timeline: the song, or further if a note runs past it (rounded up to a bar). */
export function contentTicksFor(lengthBars: number, sig: TimeSignature, farthestNoteEnd = 0): number {
  const bar = ticksPerBar(sig);
  const song = Math.max(1, lengthBars) * bar;
  return Math.max(song, Math.ceil(Math.max(0, farthestNoteEnd) / bar) * bar);
}

/** Smallest horizontal zoom: the whole content just fits the width. */
export function minPxPerTick(size: Size, contentTicks: number): number {
  return Math.min(PX_PER_TICK_MAX, Math.max(PX_PER_TICK_FLOOR, size.width / Math.max(1, contentTicks)));
}

/** Smallest row height: all 128 rows just fit the height (never below a readable minimum). */
export function minRowHeight(size: Size): number {
  return Math.min(ROW_HEIGHT_MAX, Math.max(ROW_HEIGHT_MIN, size.height / PITCH_COUNT));
}

/** Pull zoom and scroll into their legal ranges. Returns the same object when nothing changed. */
export function clampViewport(vp: Viewport, size: Size, contentTicks: number): Viewport {
  const pxPerTick = clamp(finite(vp.pxPerTick, DEFAULT_PX_PER_TICK), minPxPerTick(size, contentTicks), PX_PER_TICK_MAX);
  const rowHeight = clamp(finite(vp.rowHeight, DEFAULT_ROW_HEIGHT), minRowHeight(size), ROW_HEIGHT_MAX);
  const maxScrollTick = Math.max(0, contentTicks - size.width / pxPerTick);
  const maxScrollY = Math.max(0, PITCH_COUNT * rowHeight - size.height);
  const scrollTick = clamp(finite(vp.scrollTick, 0), 0, maxScrollTick);
  const scrollY = clamp(finite(vp.scrollY, 0), 0, maxScrollY);
  if (pxPerTick === vp.pxPerTick && rowHeight === vp.rowHeight && scrollTick === vp.scrollTick && scrollY === vp.scrollY) return vp;
  return { scrollTick, scrollY, pxPerTick, rowHeight };
}

export const sameViewport = (a: Viewport, b: Viewport): boolean =>
  a.scrollTick === b.scrollTick && a.scrollY === b.scrollY && a.pxPerTick === b.pxPerTick && a.rowHeight === b.rowHeight;

export function visibleRange(vp: Viewport, size: Size): VisibleRange {
  return {
    tickFrom: vp.scrollTick,
    tickTo: vp.scrollTick + size.width / vp.pxPerTick,
    pitchHi: clamp(PITCH_MAX - Math.floor(vp.scrollY / vp.rowHeight), PITCH_MIN, PITCH_MAX),
    pitchLo: clamp(PITCH_MAX - Math.floor((vp.scrollY + Math.max(0, size.height - 1e-6)) / vp.rowHeight), PITCH_MIN, PITCH_MAX),
  };
}

// ---------------------------------------------------------------------------------------------
// Scroll and zoom
// ---------------------------------------------------------------------------------------------

/** Scroll by pixels (positive dx moves later in time, positive dy moves to lower pitches). */
export function scrollBy(vp: Viewport, dx: number, dy: number, size: Size, contentTicks: number): Viewport {
  return clampViewport({ ...vp, scrollTick: vp.scrollTick + dx / vp.pxPerTick, scrollY: vp.scrollY + dy }, size, contentTicks);
}

/** Scroll so that `pitch` is vertically centred. */
export function centreOnPitch(vp: Viewport, pitch: number, size: Size, contentTicks: number): Viewport {
  return clampViewport({ ...vp, scrollY: (PITCH_MAX - pitch + 0.5) * vp.rowHeight - size.height / 2 }, size, contentTicks);
}

/**
 * Scale one axis by `factor`, keeping whatever is under `anchor` (grid-area pixels) where it is.
 * Without an anchor the centre of the grid is used (the toolbar buttons and keyboard).
 */
export function zoomAxis(
  vp: Viewport,
  axis: 'x' | 'y',
  factor: number,
  size: Size,
  contentTicks: number,
  anchor: { x: number; y: number } = { x: size.width / 2, y: size.height / 2 },
): Viewport {
  if (!(factor > 0) || !Number.isFinite(factor)) return vp;
  if (axis === 'x') {
    const anchorTick = xToTick(vp, anchor.x);
    const scaled = clampViewport({ ...vp, pxPerTick: vp.pxPerTick * factor }, size, contentTicks);
    return clampViewport({ ...scaled, scrollTick: anchorTick - anchor.x / scaled.pxPerTick }, size, contentTicks);
  }
  const anchorRows = (anchor.y + vp.scrollY) / vp.rowHeight;
  const scaled = clampViewport({ ...vp, rowHeight: vp.rowHeight * factor }, size, contentTicks);
  return clampViewport({ ...scaled, scrollY: anchorRows * scaled.rowHeight - anchor.y }, size, contentTicks);
}

/** The view a fresh piano roll opens with: the start of the song, middle C in the middle. */
export function defaultViewport(size: Size, contentTicks: number): Viewport {
  const base: Viewport = { scrollTick: 0, scrollY: 0, pxPerTick: DEFAULT_PX_PER_TICK, rowHeight: DEFAULT_ROW_HEIGHT };
  return centreOnPitch(clampViewport(base, size, contentTicks), DEFAULT_CENTRE_PITCH, size, contentTicks);
}

/**
 * Zoom and scroll so every note is visible with a little room around them. With no notes this is the
 * default view. Zoom limits still apply, so a single very short note cannot zoom past the maximum.
 */
export function fitToNotes(notes: readonly Pick<Note, 'pitch' | 'start' | 'duration'>[], size: Size, contentTicks: number): Viewport {
  if (notes.length === 0) return defaultViewport(size, contentTicks);
  let first = Infinity;
  let last = -Infinity;
  let lo = PITCH_MAX;
  let hi = PITCH_MIN;
  for (const n of notes) {
    first = Math.min(first, n.start);
    last = Math.max(last, n.start + n.duration);
    lo = Math.min(lo, n.pitch);
    hi = Math.max(hi, n.pitch);
  }
  const padTicks = Math.max(PPQ / 4, (last - first) * 0.04);
  const from = Math.max(0, first - padTicks);
  const to = last + padTicks;
  const rows = hi - lo + 1 + 2; // one empty row above and below
  const fitted = clampViewport(
    { scrollTick: from, scrollY: 0, pxPerTick: size.width / Math.max(1, to - from), rowHeight: size.height / rows },
    size,
    contentTicks,
  );
  // Centre the notes when the zoom limits left spare room.
  const spareTicks = size.width / fitted.pxPerTick - (to - from);
  const centred = { ...fitted, scrollTick: from - Math.max(0, spareTicks) / 2 };
  return centreOnPitch(clampViewport(centred, size, contentTicks), (lo + hi) / 2, size, contentTicks);
}

/**
 * Scroll the least amount that brings (tick, pitch) into view, leaving `marginPx` of room around it.
 * Used by the keyboard cursor so it never walks off screen. Returns the same object when already visible.
 */
export function revealCell(vp: Viewport, tick: number, pitch: number, size: Size, contentTicks: number, marginPx = 24): Viewport {
  let { scrollTick, scrollY } = vp;
  const x = tickToX(vp, tick);
  const mx = Math.min(marginPx, size.width / 4);
  if (x < mx) scrollTick = tick - mx / vp.pxPerTick;
  else if (x > size.width - mx) scrollTick = tick - (size.width - mx) / vp.pxPerTick;
  const top = pitchToY(vp, pitch);
  const my = Math.min(marginPx, size.height / 4);
  if (top < my) scrollY += top - my;
  else if (top + vp.rowHeight > size.height - my) scrollY += top + vp.rowHeight - (size.height - my);
  if (scrollTick === vp.scrollTick && scrollY === vp.scrollY) return vp;
  return clampViewport({ ...vp, scrollTick, scrollY }, size, contentTicks);
}
