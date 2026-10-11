/**
 * Snap and note-length settings for the piano roll editor (plan T5.3b). Pure.
 *
 * Both are expressed as a note division (1 = whole … 32 = thirty-second) plus a modifier, and resolve
 * to an integer tick count at PPQ 960. Every combination is a whole number of ticks (1/32 triplet is 80,
 * 1/1 dotted is 5760), so editing maths never leaves the integer grid. Snap positions are multiples of
 * the step counted from tick 0 (not from the bar line), so they stay put when the time signature changes.
 */
import { PPQ } from '../contracts/project';

export const WHOLE_TICKS = PPQ * 4;
export const DIVISIONS = [1, 2, 4, 8, 16, 32] as const;
export type Division = (typeof DIVISIONS)[number];

/** Snap: a division with an optional triplet grid, or off (free placement, whole ticks). */
export interface SnapSetting {
  division: Division | null;
  triplet: boolean;
}

/** A note length: a division, optionally dotted (×1.5) or triplet (×2/3), never both. */
export interface LengthSetting {
  division: Division;
  dotted: boolean;
  triplet: boolean;
}

export const DEFAULT_SNAP: SnapSetting = { division: 16, triplet: false };
export const DEFAULT_LENGTH: LengthSetting = { division: 4, dotted: false, triplet: false };
/** When snap is off, keys that move "by the grid" use a sixteenth. */
export const FALLBACK_STEP = WHOLE_TICKS / 16;

export function divisionTicks(d: Division): number {
  return WHOLE_TICKS / d;
}

/** Ticks per grid step, or null when snap is off. */
export function snapTicks(s: SnapSetting): number | null {
  if (s.division === null) return null;
  const base = divisionTicks(s.division);
  return s.triplet ? (base * 2) / 3 : base;
}

export function lengthTicks(l: LengthSetting): number {
  const base = divisionTicks(l.division);
  if (l.dotted) return (base * 3) / 2;
  if (l.triplet) return (base * 2) / 3;
  return base;
}

/** Dotted and triplet exclude each other: turning one on turns the other off. */
export function withLength(l: LengthSetting, change: Partial<LengthSetting>): LengthSetting {
  const next = { ...l, ...change };
  if (change.dotted && !change.triplet) next.triplet = false;
  if (change.triplet && !change.dotted) next.dotted = false;
  return next;
}

/** The step the grid-aware keys use. */
export const gridStep = (s: SnapSetting): number => snapTicks(s) ?? FALLBACK_STEP;

// ---- choosing a snap value in the UI ---------------------------------------------------------

export interface SnapOption {
  id: string;
  label: string;
  setting: SnapSetting;
  ticks: number | null;
}

const option = (division: Division | null, triplet: boolean): SnapOption => {
  const setting = { division, triplet: division === null ? false : triplet };
  const id = division === null ? 'off' : `1/${division}${triplet ? 'T' : ''}`;
  const label = division === null ? 'Off' : `1/${division}${triplet ? ' triplet' : ''}`;
  return { id, label, setting, ticks: snapTicks(setting) };
};

/** Off, 1/1 … 1/32, then the triplet grids. */
export const SNAP_OPTIONS: readonly SnapOption[] = [
  option(null, false),
  ...DIVISIONS.map((d) => option(d, false)),
  ...DIVISIONS.map((d) => option(d, true)),
];

export const snapId = (s: SnapSetting): string => option(s.division, s.triplet).id;

export function snapFromId(id: string): SnapSetting | null {
  return SNAP_OPTIONS.find((o) => o.id === id)?.setting ?? null;
}

export const snapLabel = (s: SnapSetting): string => option(s.division, s.triplet).label;

// ---- snapping a position ---------------------------------------------------------------------

/** Nearest grid line (or the nearest whole tick when `step` is null). Never negative. */
export function snapRound(tick: number, step: number | null): number {
  const t = step === null ? Math.round(tick) : Math.round(tick / step) * step;
  return Math.max(0, t);
}

/** Grid line at or before `tick`: the cell a click lands in. */
export function snapFloor(tick: number, step: number | null): number {
  const t = step === null ? Math.round(tick) : Math.floor(tick / step + 1e-9) * step;
  return Math.max(0, t);
}

/** The step in force for one gesture: Alt bypasses snap. */
export const stepFor = (s: SnapSetting, altKey: boolean): number | null => (altKey ? null : snapTicks(s));

// ---- names -----------------------------------------------------------------------------------

const DIVISION_NAMES: Record<Division, string> = {
  1: 'whole',
  2: 'half',
  4: 'quarter',
  8: 'eighth',
  16: 'sixteenth',
  32: 'thirty-second',
};

export const divisionName = (d: Division): string => DIVISION_NAMES[d];

export function lengthName(l: LengthSetting): string {
  return `${l.dotted ? 'dotted ' : ''}${DIVISION_NAMES[l.division]}${l.triplet ? ' triplet' : ''}`;
}

/** "quarter note", "dotted eighth note", "eighth triplet note", or "123 ticks" for a length that matches no preset. */
export function describeLength(ticks: number): string {
  for (const d of DIVISIONS) {
    for (const mod of [{ dotted: false, triplet: false }, { dotted: true, triplet: false }, { dotted: false, triplet: true }]) {
      const l: LengthSetting = { division: d, ...mod };
      if (lengthTicks(l) === ticks) return `${lengthName(l)} note`;
    }
  }
  return `${ticks} ${ticks === 1 ? 'tick' : 'ticks'}`;
}
