import { describe, expect, it } from 'vitest';
import type { Note } from '../contracts/project';
import { HIT_TOLERANCE_PX, RESIZE_HANDLE_PX, handleWidth, hitTest } from './hit-test';
import { buildNoteIndex } from './notes';
import { pitchToY, tickToX, type Viewport } from './viewport';

const vp: Viewport = { scrollTick: 0, scrollY: 0, pxPerTick: 0.1, rowHeight: 16 };
const n = (id: string, pitch: number, start: number, duration: number): Note => ({ id, pitch, start, duration, velocity: 100 });
const rowMid = (pitch: number) => pitchToY(vp, pitch) + vp.rowHeight / 2;

describe('hitTest', () => {
  const index = buildNoteIndex([n('a', 60, 960, 960), n('b', 62, 960, 960)]); // a: x 96…192
  const ax = tickToX(vp, 960);

  it('finds the note under the pointer and calls the middle the body', () => {
    expect(hitTest(index, vp, ax + 40, rowMid(60))).toMatchObject({ note: { id: 'a' }, zone: 'body' });
  });

  it('the last few pixels of the right edge are the resize handle', () => {
    const right = ax + 96 - 1; // drawn width is duration*px - 1
    expect(hitTest(index, vp, right - 2, rowMid(60))).toMatchObject({ zone: 'resize' });
    expect(hitTest(index, vp, right - RESIZE_HANDLE_PX - 2, rowMid(60))).toMatchObject({ zone: 'body' });
  });

  it('a pointer just outside the right edge still grabs the handle, further out misses', () => {
    const right = ax + 96 - 1;
    expect(hitTest(index, vp, right + HIT_TOLERANCE_PX - 0.5, rowMid(60))).toMatchObject({ note: { id: 'a' }, zone: 'resize' });
    expect(hitTest(index, vp, right + HIT_TOLERANCE_PX + 2, rowMid(60))).toBeNull();
    expect(hitTest(index, vp, ax - HIT_TOLERANCE_PX - 2, rowMid(60))).toBeNull();
  });

  it('matches the row exactly, including the gap between rows', () => {
    expect(hitTest(index, vp, ax + 40, pitchToY(vp, 60) + 0.2)?.note.id).toBe('a');
    expect(hitTest(index, vp, ax + 40, pitchToY(vp, 60) + vp.rowHeight - 0.2)?.note.id).toBe('a');
    expect(hitTest(index, vp, ax + 40, rowMid(61))).toBeNull();
  });

  it('picks the right note when several share a time', () => {
    expect(hitTest(index, vp, ax + 40, rowMid(62))?.note.id).toBe('b');
  });

  it('a very narrow note keeps a body: the handle is a third of it, at least 3 px', () => {
    expect(handleWidth(100)).toBe(RESIZE_HANDLE_PX);
    expect(handleWidth(12)).toBe(4);
    expect(handleWidth(2)).toBe(3);
    const thin = buildNoteIndex([n('t', 60, 0, 200)]); // 20 px wide → handle ≈ 6.3
    expect(hitTest(thin, vp, 2, rowMid(60))).toMatchObject({ zone: 'body' });
    expect(hitTest(thin, vp, 18, rowMid(60))).toMatchObject({ zone: 'resize' });
  });

  it('adjacent notes of one pitch: the nearer one wins at the seam', () => {
    const seam = buildNoteIndex([n('x', 60, 0, 960), n('y', 60, 960, 960)]);
    const edge = tickToX(vp, 960);
    expect(hitTest(seam, vp, edge - 1.4, rowMid(60))).toMatchObject({ note: { id: 'x' }, zone: 'resize' });
    expect(hitTest(seam, vp, edge + 1.4, rowMid(60))).toMatchObject({ note: { id: 'y' }, zone: 'body' });
  });

  it('works when scrolled and zoomed', () => {
    const moved: Viewport = { scrollTick: 480, scrollY: 100, pxPerTick: 0.25, rowHeight: 20 };
    const x = tickToX(moved, 1000);
    const y = pitchToY(moved, 60) + 10;
    expect(hitTest(index, moved, x, y)?.note.id).toBe('a');
  });

  it('nothing at negative coordinates or on an empty roll', () => {
    expect(hitTest(index, vp, -5, rowMid(60))).toBeNull();
    expect(hitTest(index, vp, 100, -1)).toBeNull();
    expect(hitTest(buildNoteIndex([]), vp, 100, 100)).toBeNull();
  });
});
