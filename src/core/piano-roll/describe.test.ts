import { describe, expect, it } from 'vitest';
import { describeNote, describePosition, countNotes } from './describe';
import { clampViewport, defaultViewport, revealCell, tickToX, pitchToY, type Size } from './viewport';

const four = { numerator: 4, denominator: 4 } as const;
const six8 = { numerator: 6, denominator: 8 } as const;

describe('describePosition', () => {
  it('counts bars and beats from 1', () => {
    expect(describePosition(0, four)).toBe('bar 1, beat 1');
    expect(describePosition(960, four)).toBe('bar 1, beat 2');
    expect(describePosition(3840 + 2 * 960, four)).toBe('bar 2, beat 3');
  });
  it('says how far off the beat it is', () => {
    expect(describePosition(1200, four)).toBe('bar 1, beat 2 plus 240 ticks');
    expect(describePosition(1, four)).toBe('bar 1, beat 1 plus 1 tick');
  });
  it('6/8 has two dotted-quarter beats per bar', () => {
    expect(describePosition(1440, six8)).toBe('bar 1, beat 2');
    expect(describePosition(2880, six8)).toBe('bar 2, beat 1');
  });
  it('negative positions read as the start', () => {
    expect(describePosition(-5, four)).toBe('bar 1, beat 1');
  });
});

describe('describeNote', () => {
  it('names pitch, length and place', () => {
    expect(describeNote({ pitch: 60, start: 0, duration: 960 }, four)).toBe('C4 quarter note at bar 1, beat 1');
    expect(describeNote({ pitch: 61, start: 3840, duration: 1440 }, four)).toBe('C#4 dotted quarter note at bar 2, beat 1');
  });
  it('pluralises', () => {
    expect(countNotes(1)).toBe('1 note');
    expect(countNotes(3)).toBe('3 notes');
  });
});

describe('revealCell (keyboard cursor stays on screen)', () => {
  const size: Size = { width: 600, height: 300 };
  const content = 8 * 3840;
  const vp = defaultViewport(size, content);

  it('does nothing when the cell is already comfortably visible', () => {
    expect(revealCell(vp, vp.scrollTick + 2000, 60, size, content)).toBe(vp);
  });

  it('scrolls right and left just enough', () => {
    const right = revealCell(vp, 6000, 60, size, content);
    expect(tickToX(right, 6000)).toBeLessThanOrEqual(size.width);
    expect(right.scrollTick).toBeGreaterThan(vp.scrollTick);
    const back = revealCell(right, 100, 60, size, content);
    expect(tickToX(back, 100)).toBeGreaterThanOrEqual(0);
  });

  it('scrolls up and down to a pitch', () => {
    const high = revealCell(vp, 100, 120, size, content);
    expect(pitchToY(high, 120)).toBeGreaterThanOrEqual(0);
    const low = revealCell(vp, 100, 5, size, content);
    expect(pitchToY(low, 5) + low.rowHeight).toBeLessThanOrEqual(size.height);
  });

  it('result is always a legal viewport', () => {
    const v = revealCell(vp, 999999, 0, size, content);
    expect(clampViewport(v, size, content)).toBe(v);
  });
});
