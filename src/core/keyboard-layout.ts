/** Piano keyboard geometry for the on-screen keys. Pure; the SVG component only draws what this returns. */
import { isBlackKey } from './pitch';

export interface KeyRect {
  pitch: number;
  black: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KeyboardLayout {
  keys: KeyRect[];
  width: number;
  height: number;
  /** x of each white key's left edge by pitch, for scrolling a pitch into view. */
  xOf(pitch: number): number;
}

export const FULL_RANGE = { lo: 21, hi: 108 } as const; // A0 … C8, the 88 keys of a piano
export const SIXTY_ONE = { lo: 36, hi: 96 } as const; // C2 … C7

export interface Dimensions {
  whiteW: number;
  whiteH: number;
  blackW: number;
  blackH: number;
}

export const DEFAULT_DIMENSIONS: Dimensions = { whiteW: 24, whiteH: 104, blackW: 15, blackH: 64 };

/** Whites are laid edge to edge; each black key straddles the join between its two white neighbours. */
export function layoutKeys(lo: number, hi: number, dim: Dimensions = DEFAULT_DIMENSIONS): KeyboardLayout {
  const whites: KeyRect[] = [];
  const blacks: KeyRect[] = [];
  const whiteX = new Map<number, number>();
  let whiteCount = 0;
  for (let pitch = lo; pitch <= hi; pitch++) {
    if (!isBlackKey(pitch)) {
      const x = whiteCount * dim.whiteW;
      whites.push({ pitch, black: false, x, y: 0, w: dim.whiteW, h: dim.whiteH });
      whiteX.set(pitch, x);
      whiteCount++;
    }
  }
  for (let pitch = lo; pitch <= hi; pitch++) {
    if (!isBlackKey(pitch)) continue;
    // The white key just below sits to its left; the join is at that key's right edge.
    const below = whiteX.get(pitch - 1);
    const join = below !== undefined ? below + dim.whiteW : (whiteX.get(pitch + 1) ?? 0);
    blacks.push({ pitch, black: true, x: join - dim.blackW / 2, y: 0, w: dim.blackW, h: dim.blackH });
  }
  const all = [...whites, ...blacks].sort((a, b) => a.pitch - b.pitch);
  const xs = new Map(all.map((k) => [k.pitch, k.x]));
  return {
    keys: all,
    width: whiteCount * dim.whiteW,
    height: dim.whiteH,
    xOf: (p) => xs.get(p) ?? 0,
  };
}

/** Which key is under (x, y)? Black keys are on top, so they win where they overlap a white key. */
export function pitchAt(layout: KeyboardLayout, x: number, y: number): number | null {
  const hit = (k: KeyRect) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h;
  return layout.keys.find((k) => k.black && hit(k))?.pitch ?? layout.keys.find((k) => !k.black && hit(k))?.pitch ?? null;
}
