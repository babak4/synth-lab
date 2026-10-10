import { describe, expect, it } from 'vitest';
import type { Note } from '@/core/contracts/project';
import { visibleRange, xToTick } from '@/core/piano-roll';
import { createPianoRollViewStore } from './piano-roll-view';

const note = (pitch: number, start: number, duration: number): Note => ({ id: `${pitch}-${start}`, pitch, start, duration, velocity: 90 });
const SIZE = { width: 800, height: 400 };

function ready() {
  const store = createPianoRollViewStore();
  store.getState().setContentTicks(8 * 3840);
  store.getState().setSize(SIZE);
  return store;
}

describe('piano roll view store', () => {
  it('places the view on middle C the first time it gets a real size', () => {
    const store = createPianoRollViewStore();
    store.getState().setSize(SIZE);
    const { viewport } = store.getState();
    const r = visibleRange(viewport, SIZE);
    expect(r.pitchLo).toBeLessThan(60);
    expect(r.pitchHi).toBeGreaterThan(60);
    expect(viewport.scrollTick).toBe(0);
  });

  it('does not re-centre on later resizes, only keeps the view legal', () => {
    const store = ready();
    store.getState().scrollBy(500, 0);
    const before = store.getState().viewport.scrollTick;
    store.getState().setSize({ width: 700, height: 400 });
    expect(store.getState().viewport.scrollTick).toBeGreaterThan(0);
    expect(store.getState().viewport.scrollTick).toBeLessThanOrEqual(before + 8 * 3840);
  });

  it('ignores a repeat of the same size', () => {
    const store = ready();
    const vp = store.getState().viewport;
    store.getState().setSize({ ...SIZE });
    expect(store.getState().viewport).toBe(vp);
  });

  it('scrolls within bounds and does nothing when already at the edge', () => {
    const store = ready();
    store.getState().scrollBy(-100, 0);
    expect(store.getState().viewport.scrollTick).toBe(0);
    const vp = store.getState().viewport;
    store.getState().scrollBy(0, 0);
    expect(store.getState().viewport).toBe(vp);
    store.getState().scrollBy(1e9, 0);
    expect(store.getState().viewport.scrollTick).toBeCloseTo(8 * 3840 - 8000, 6);
  });

  it('zooms about an anchor', () => {
    const store = ready();
    store.getState().scrollBy(400, 0);
    const vp = store.getState().viewport;
    const anchor = { x: 200, y: 50 };
    const tick = xToTick(vp, anchor.x);
    store.getState().zoom('x', 2, anchor);
    expect(store.getState().viewport.pxPerTick).toBeCloseTo(vp.pxPerTick * 2, 12);
    expect(xToTick(store.getState().viewport, anchor.x)).toBeCloseTo(tick, 6);
  });

  it('re-clamps when the song gets shorter', () => {
    const store = ready();
    store.getState().scrollBy(1e9, 0);
    store.getState().setContentTicks(2 * 3840);
    const vp = store.getState().viewport;
    const r = visibleRange(vp, SIZE);
    expect(r.tickTo).toBeLessThanOrEqual(2 * 3840 + 1e-6);
  });

  it('fits to the notes it is given, and to the default view when there are none', () => {
    const store = ready();
    store.getState().fit([note(70, 3840, 480), note(74, 4800, 480)]);
    const r = visibleRange(store.getState().viewport, SIZE);
    expect(r.tickFrom).toBeLessThanOrEqual(3840);
    expect(r.tickTo).toBeGreaterThanOrEqual(5280);
    expect(r.pitchHi).toBeGreaterThanOrEqual(74);
    expect(r.pitchLo).toBeLessThanOrEqual(70);
    const zoomed = store.getState().viewport;
    store.getState().fit([]);
    expect(store.getState().viewport).not.toEqual(zoomed);
    expect(store.getState().viewport.scrollTick).toBe(0);
  });

  it('applies decoded actions', () => {
    const store = ready();
    store.getState().apply({ kind: 'scroll', dx: 100, dy: 0 }, []);
    expect(store.getState().viewport.scrollTick).toBeCloseTo(1000, 9);
    store.getState().apply({ kind: 'zoom', axis: 'y', factor: 1.25 }, []);
    expect(store.getState().viewport.rowHeight).toBe(20);
    store.getState().apply({ kind: 'fit' }, [note(60, 0, 3840)]);
    expect(store.getState().viewport.pxPerTick).toBeGreaterThan(0.1);
  });

  it('resets to the default view', () => {
    const store = ready();
    const start = store.getState().viewport;
    store.getState().scrollBy(900, 300);
    store.getState().zoom('x', 3);
    store.getState().reset();
    expect(store.getState().viewport).toEqual(start);
  });

  it('toggles ghost notes, on by default', () => {
    const store = createPianoRollViewStore();
    expect(store.getState().ghostNotes).toBe(true);
    store.getState().setGhostNotes(false);
    expect(store.getState().ghostNotes).toBe(false);
  });
});
