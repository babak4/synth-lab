/**
 * Turns wheel and key events into viewport actions (plan T5.3a). Pure, so the mapping (which gesture
 * scrolls, which zooms) is unit-tested without a DOM.
 */
import { ZOOM_STEP, type Size } from './viewport';

export type ViewAction =
  | { kind: 'scroll'; dx: number; dy: number }
  | { kind: 'zoom'; axis: 'x' | 'y'; factor: number }
  | { kind: 'fit' };

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages. */
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const LINE_PX = 16;
/** Zoom per pixel of wheel travel: a 100 px notch is about 14%. */
const WHEEL_ZOOM_RATE = 0.0015;
const MAX_WHEEL_ZOOM = 4;

/** Wheel deltas in pixels whatever the device reports. */
export function wheelPixels(e: Pick<WheelLike, 'deltaX' | 'deltaY' | 'deltaMode'>, page: Size): { dx: number; dy: number } {
  const [kx, ky] = e.deltaMode === 1 ? [LINE_PX, LINE_PX] : e.deltaMode === 2 ? [page.width, page.height] : [1, 1];
  return { dx: e.deltaX * kx, dy: e.deltaY * ky };
}

/**
 * Plain wheel scrolls (both axes for a trackpad); Shift+wheel scrolls sideways; Ctrl/Cmd+wheel (also a
 * trackpad pinch, which browsers report as Ctrl+wheel) zooms time; Alt+wheel zooms pitch.
 */
export function interpretWheel(e: WheelLike, page: Size): ViewAction | null {
  const { dx, dy } = wheelPixels(e, page);
  if (dx === 0 && dy === 0) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) {
    const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    const factor = Math.min(MAX_WHEEL_ZOOM, Math.max(1 / MAX_WHEEL_ZOOM, Math.exp(-delta * WHEEL_ZOOM_RATE)));
    return { kind: 'zoom', axis: e.altKey && !e.ctrlKey && !e.metaKey ? 'y' : 'x', factor };
  }
  if (e.shiftKey && dx === 0) return { kind: 'scroll', dx: dy, dy: 0 };
  return { kind: 'scroll', dx, dy };
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const ARROW_PX = 48;
const SHIFT_ARROW_PX = 240;

/**
 * Keys on the focused piano roll: arrows scroll (Shift for bigger steps), PageUp/PageDown scroll a
 * page of pitches, + and - zoom time, ] and [ zoom pitch, F fits the notes. Anything with Ctrl, Cmd or
 * Alt is left to the browser and the app.
 */
export function interpretKey(e: KeyLike, page: Size): ViewAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const step = e.shiftKey ? SHIFT_ARROW_PX : ARROW_PX;
  switch (e.key) {
    case 'ArrowLeft': return { kind: 'scroll', dx: -step, dy: 0 };
    case 'ArrowRight': return { kind: 'scroll', dx: step, dy: 0 };
    case 'ArrowUp': return { kind: 'scroll', dx: 0, dy: -step };
    case 'ArrowDown': return { kind: 'scroll', dx: 0, dy: step };
    case 'PageUp': return { kind: 'scroll', dx: 0, dy: -page.height * 0.9 };
    case 'PageDown': return { kind: 'scroll', dx: 0, dy: page.height * 0.9 };
    case '+':
    case '=': return { kind: 'zoom', axis: 'x', factor: ZOOM_STEP };
    case '-':
    case '_': return { kind: 'zoom', axis: 'x', factor: 1 / ZOOM_STEP };
    case ']': return { kind: 'zoom', axis: 'y', factor: ZOOM_STEP };
    case '[': return { kind: 'zoom', axis: 'y', factor: 1 / ZOOM_STEP };
    case 'f':
    case 'F': return { kind: 'fit' };
    default: return null;
  }
}
