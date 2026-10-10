/** The piano column and pitch lanes of the piano roll (plan T5.3a). */
import { isBlackKey, noteName } from '../pitch';
import { PITCH_MAX, visibleRange, type Size, type Viewport } from './viewport';

export interface KeyRow {
  pitch: number;
  /** Grid-area pixels. */
  y: number;
  h: number;
  black: boolean;
  /** Text for the key ("C4"), or null where the row is too thin or the key is not worth labelling. */
  label: string | null;
}

/** At or above this row height every white key is labelled; below it only the Cs are. */
export const LABEL_ALL_WHITE_AT = 18;
/** Below this nothing is labelled at all. */
export const LABEL_MIN_ROW = 9;

export function pitchLabel(pitch: number, rowHeight: number): string | null {
  if (rowHeight < LABEL_MIN_ROW) return null;
  if (pitch % 12 === 0) return noteName(pitch);
  if (rowHeight >= LABEL_ALL_WHITE_AT && !isBlackKey(pitch)) return noteName(pitch);
  return null;
}

/** Rows that are at least partly on screen, highest pitch first. */
export function keyRows(vp: Viewport, size: Size): KeyRow[] {
  const { pitchLo, pitchHi } = visibleRange(vp, size);
  const rows: KeyRow[] = [];
  for (let pitch = pitchHi; pitch >= pitchLo; pitch--) {
    rows.push({
      pitch,
      y: (PITCH_MAX - pitch) * vp.rowHeight - vp.scrollY,
      h: vp.rowHeight,
      black: isBlackKey(pitch),
      label: pitchLabel(pitch, vp.rowHeight),
    });
  }
  return rows;
}
