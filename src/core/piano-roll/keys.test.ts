import { describe, expect, it } from 'vitest';
import { LABEL_ALL_WHITE_AT, LABEL_MIN_ROW, keyRows, pitchLabel } from './keys';
import type { Viewport } from './viewport';

const VP: Viewport = { scrollTick: 0, scrollY: 16 * 60, pxPerTick: 0.1, rowHeight: 16 }; // top row is pitch 67

describe('pitchLabel', () => {
  it('always labels the Cs when there is room, with C4 as middle C', () => {
    expect(pitchLabel(60, 12)).toBe('C4');
    expect(pitchLabel(72, 10)).toBe('C5');
    expect(pitchLabel(0, 12)).toBe('C-1');
  });
  it('labels every white key only on tall rows, never black keys', () => {
    expect(pitchLabel(62, LABEL_ALL_WHITE_AT - 1)).toBeNull();
    expect(pitchLabel(62, LABEL_ALL_WHITE_AT)).toBe('D4');
    expect(pitchLabel(61, 32)).toBeNull();
  });
  it('labels nothing on very thin rows', () => {
    expect(pitchLabel(60, LABEL_MIN_ROW - 1)).toBeNull();
  });
});

describe('keyRows', () => {
  const size = { width: 800, height: 100 };
  it('lists the rows on screen, highest first, with their positions', () => {
    const rows = keyRows(VP, size);
    expect(rows[0]).toMatchObject({ pitch: 67, y: 0, h: 16 });
    expect(rows[1]!.pitch).toBe(66);
    expect(rows[1]!.y).toBe(16);
    expect(rows.at(-1)!.y).toBeLessThan(size.height);
    expect(rows.at(-1)!.y + rows.at(-1)!.h).toBeGreaterThanOrEqual(size.height - 16);
  });
  it('flags black keys correctly', () => {
    const rows = keyRows(VP, size);
    for (const r of rows) expect(r.black).toBe([1, 3, 6, 8, 10].includes(r.pitch % 12));
  });
  it('rows are contiguous', () => {
    const rows = keyRows({ ...VP, scrollY: 123.5 }, size);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.y).toBeCloseTo(rows[i - 1]!.y + rows[i - 1]!.h, 9);
    expect(rows[0]!.y).toBeLessThanOrEqual(0);
  });
  it('covers 0–127 exactly when everything fits', () => {
    const rows = keyRows({ ...VP, scrollY: 0, rowHeight: 8 }, { width: 100, height: 128 * 8 });
    expect(rows.length).toBe(128);
    expect(rows[0]!.pitch).toBe(127);
    expect(rows.at(-1)!.pitch).toBe(0);
  });
  it('includes middle C label where visible', () => {
    expect(keyRows({ ...VP, scrollY: 16 * 60 }, { width: 100, height: 200 }).find((r) => r.pitch === 60)!.label).toBe('C4');
  });
});
