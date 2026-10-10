import { describe, expect, it } from 'vitest';
import { PPQ, type Note } from './contracts/project';
import { ADD_DISABLED_REASON, barLines, canAddTrack, layoutMiniNotes, nudgeIndex } from './arrangement';

const note = (pitch: number, start: number, duration = PPQ): Note => ({ id: `${pitch}-${start}`, pitch, start, duration, velocity: 100 });

describe('layoutMiniNotes', () => {
  it('is empty for no notes or no length', () => {
    expect(layoutMiniNotes([], 1000)).toEqual([]);
    expect(layoutMiniNotes([note(60, 0)], 0)).toEqual([]);
  });
  it('maps ticks to lane fractions and higher pitches nearer the top', () => {
    const total = PPQ * 4;
    const [low, high] = layoutMiniNotes([note(48, 0), note(72, PPQ * 2, PPQ * 2)], total);
    expect(low!.x).toBe(0);
    expect(low!.w).toBeCloseTo(0.25);
    expect(high!.x).toBeCloseTo(0.5);
    expect(high!.w).toBeCloseTo(0.5);
    expect(high!.y).toBeLessThan(low!.y);
    expect(low!.y + low!.h).toBeCloseTo(1);
    expect(high!.y).toBeCloseTo(0);
  });
  it('keeps every note inside the lane and clips at the project end', () => {
    const total = PPQ * 4;
    const out = layoutMiniNotes([note(60, PPQ * 3, PPQ * 4), note(61, total + 5), note(62, 0)], total);
    expect(out).toHaveLength(2);
    for (const m of out) {
      expect(m.x + m.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(m.y).toBeGreaterThanOrEqual(-1e-9);
      expect(m.y + m.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('does not stretch a single note over the whole lane height', () => {
    const [m] = layoutMiniNotes([note(60, 0)], PPQ * 4);
    expect(m!.h).toBeCloseTo(1 / 12);
  });
  it('keeps very short notes visible', () => {
    const [m] = layoutMiniNotes([note(60, 0, 1)], PPQ * 64);
    expect(m!.w).toBeGreaterThan(0);
  });
});

describe('row ordering', () => {
  it('nudges within bounds and stops at the ends', () => {
    expect(nudgeIndex(1, -1, 3)).toBe(0);
    expect(nudgeIndex(1, 1, 3)).toBe(2);
    expect(nudgeIndex(0, -1, 3)).toBeNull();
    expect(nudgeIndex(2, 1, 3)).toBeNull();
    expect(nudgeIndex(5, 1, 3)).toBeNull();
  });
  it('bar lines divide the lane', () => {
    expect(barLines(4)).toEqual([0.25, 0.5, 0.75]);
    expect(barLines(1)).toEqual([]);
  });
  it('limits the track count', () => {
    expect(canAddTrack(7)).toBe(true);
    expect(canAddTrack(8)).toBe(false);
    expect(ADD_DISABLED_REASON).toContain('8');
  });
});
