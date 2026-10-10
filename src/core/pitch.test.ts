import { describe, expect, it } from 'vitest';
import { ftom, isBlackKey, mtof, noteName } from './pitch';

describe('pitch', () => {
  it('maps MIDI to Hz around A4', () => {
    expect(mtof(69)).toBe(440);
    expect(mtof(57)).toBeCloseTo(220, 9);
    expect(mtof(60)).toBeCloseTo(261.6256, 3);
    expect(mtof(69, 432)).toBe(432);
  });
  it('ftom inverts mtof', () => {
    for (const p of [24, 48, 60, 69, 96]) expect(ftom(mtof(p))).toBeCloseTo(p, 9);
    expect(ftom(466.1638)).toBeCloseTo(70, 3);
  });
  it('names notes with the C4 = 60 convention', () => {
    expect([60, 61, 69, 71, 72, 12, 108, 0].map(noteName)).toEqual(['C4', 'C#4', 'A4', 'B4', 'C5', 'C0', 'C8', 'C-1']);
  });
  it('identifies black keys', () => {
    expect([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].map(isBlackKey)).toEqual([false, true, false, true, false, false, true, false, true, false, true, false]);
  });
});
