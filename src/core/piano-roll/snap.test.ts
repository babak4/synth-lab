import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LENGTH,
  DEFAULT_SNAP,
  DIVISIONS,
  FALLBACK_STEP,
  SNAP_OPTIONS,
  describeLength,
  gridStep,
  lengthTicks,
  snapFloor,
  snapFromId,
  snapId,
  snapLabel,
  snapRound,
  snapTicks,
  stepFor,
  withLength,
} from './snap';

describe('snap values', () => {
  it('1/1 … 1/32 are 3840 … 120 ticks', () => {
    expect(DIVISIONS.map((d) => snapTicks({ division: d, triplet: false }))).toEqual([3840, 1920, 960, 480, 240, 120]);
  });

  it('triplet grids are two thirds of the plain step, always whole ticks', () => {
    expect(DIVISIONS.map((d) => snapTicks({ division: d, triplet: true }))).toEqual([2560, 1280, 640, 320, 160, 80]);
  });

  it('off has no step; the grid keys fall back to a sixteenth', () => {
    expect(snapTicks({ division: null, triplet: false })).toBeNull();
    expect(gridStep({ division: null, triplet: false })).toBe(FALLBACK_STEP);
    expect(gridStep(DEFAULT_SNAP)).toBe(240);
  });

  it('Alt bypasses snap for the gesture', () => {
    expect(stepFor(DEFAULT_SNAP, false)).toBe(240);
    expect(stepFor(DEFAULT_SNAP, true)).toBeNull();
  });

  it('offers off, six plain and six triplet values, and ids round-trip', () => {
    expect(SNAP_OPTIONS).toHaveLength(13);
    expect(SNAP_OPTIONS[0]!.id).toBe('off');
    for (const o of SNAP_OPTIONS) {
      expect(snapFromId(o.id)).toEqual(o.setting);
      expect(snapId(o.setting)).toBe(o.id);
      expect(snapTicks(o.setting)).toBe(o.ticks);
    }
    expect(snapFromId('nonsense')).toBeNull();
    expect(snapLabel({ division: 8, triplet: true })).toBe('1/8 triplet');
    expect(snapLabel({ division: null, triplet: true })).toBe('Off');
  });
});

describe('snapping a position', () => {
  it('rounds to the nearest line, floors to the cell, and never goes negative', () => {
    expect(snapRound(359, 240)).toBe(240);
    expect(snapRound(361, 240)).toBe(480);
    expect(snapRound(-500, 240)).toBe(0);
    expect(snapFloor(479, 240)).toBe(240);
    expect(snapFloor(480, 240)).toBe(480);
    expect(snapFloor(-10, 240)).toBe(0);
  });

  it('with no step, positions are whole ticks', () => {
    expect(snapRound(100.6, null)).toBe(101);
    expect(snapFloor(100.4, null)).toBe(100);
  });

  it('triplet positions are multiples of 160 at 1/16T', () => {
    expect(snapRound(330, 160)).toBe(320);
    expect(snapFloor(479, 160)).toBe(320);
  });

  it('floor is not thrown by floating-point error just under a line', () => {
    expect(snapFloor(480 - 1e-12, 240)).toBe(480);
  });
});

describe('note lengths', () => {
  it('the six plain presets, dotted and triplet', () => {
    expect(DIVISIONS.map((division) => lengthTicks({ division, dotted: false, triplet: false }))).toEqual([3840, 1920, 960, 480, 240, 120]);
    expect(DIVISIONS.map((division) => lengthTicks({ division, dotted: true, triplet: false }))).toEqual([5760, 2880, 1440, 720, 360, 180]);
    expect(DIVISIONS.map((division) => lengthTicks({ division, dotted: false, triplet: true }))).toEqual([2560, 1280, 640, 320, 160, 80]);
  });

  it('dotted and triplet exclude each other', () => {
    const dotted = withLength(DEFAULT_LENGTH, { dotted: true });
    expect(dotted).toMatchObject({ dotted: true, triplet: false });
    const triplet = withLength(dotted, { triplet: true });
    expect(triplet).toMatchObject({ dotted: false, triplet: true });
    expect(withLength(triplet, { triplet: false })).toMatchObject({ dotted: false, triplet: false });
    expect(withLength(triplet, { division: 8 })).toMatchObject({ division: 8, triplet: true });
  });

  it('names a length for the status region', () => {
    expect(describeLength(960)).toBe('quarter note');
    expect(describeLength(1440)).toBe('dotted quarter note');
    expect(describeLength(640)).toBe('quarter triplet note');
    expect(describeLength(120)).toBe('thirty-second note');
    expect(describeLength(123)).toBe('123 ticks');
    expect(describeLength(1)).toBe('1 tick');
  });
});
