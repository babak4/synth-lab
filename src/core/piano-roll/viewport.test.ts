import { describe, expect, it } from 'vitest';
import { PPQ, ticksPerBar, type Note } from '../contracts/project';
import {
  DEFAULT_PX_PER_TICK,
  PITCH_COUNT,
  PX_PER_TICK_FLOOR,
  PX_PER_TICK_MAX,
  ROW_HEIGHT_MAX,
  ROW_HEIGHT_MIN,
  centreOnPitch,
  clampViewport,
  contentTicksFor,
  defaultViewport,
  fitToNotes,
  minPxPerTick,
  minRowHeight,
  pitchToY,
  scrollBy,
  tickToX,
  visibleRange,
  xToTick,
  yToPitch,
  zoomAxis,
  type Size,
  type Viewport,
} from './viewport';

const SIZE: Size = { width: 800, height: 400 };
const FOUR_FOUR = { numerator: 4, denominator: 4 } as const;
const CONTENT = 8 * ticksPerBar(FOUR_FOUR); // 30720 ticks
const vp = (over: Partial<Viewport> = {}): Viewport => ({ scrollTick: 0, scrollY: 0, pxPerTick: 0.1, rowHeight: 16, ...over });
const note = (pitch: number, start: number, duration: number): Note => ({ id: `${pitch}-${start}`, pitch, start, duration, velocity: 100 });

describe('coordinate conversion', () => {
  it('maps ticks to x and back', () => {
    const v = vp({ scrollTick: 960, pxPerTick: 0.25 });
    expect(tickToX(v, 960)).toBe(0);
    expect(tickToX(v, 1920)).toBe(240);
    expect(xToTick(v, 240)).toBe(1920);
    for (const t of [0, 1, 479, 960, 12345]) expect(xToTick(v, tickToX(v, t))).toBeCloseTo(t, 9);
  });

  it('puts higher pitches higher up', () => {
    const v = vp();
    expect(pitchToY(v, 127)).toBe(0);
    expect(pitchToY(v, 126)).toBe(16);
    expect(pitchToY(v, 0)).toBe(127 * 16);
    expect(pitchToY(v, 60)).toBeLessThan(pitchToY(v, 59));
  });

  it('maps y to the pitch of the row it lies in, and back', () => {
    const v = vp({ scrollY: 100 });
    for (let p = 0; p <= 127; p++) {
      const top = pitchToY(v, p);
      expect(yToPitch(v, top)).toBe(p);
      expect(yToPitch(v, top + v.rowHeight - 0.01)).toBe(p);
    }
  });

  it('clamps y outside the keyboard to the end pitches', () => {
    const v = vp();
    expect(yToPitch(v, -50)).toBe(127);
    expect(yToPitch(v, 99999)).toBe(0);
  });
});

describe('contentTicksFor', () => {
  it('is the song length when notes stay inside it', () => {
    expect(contentTicksFor(8, FOUR_FOUR, 0)).toBe(8 * 3840);
    expect(contentTicksFor(8, FOUR_FOUR, 5 * 3840)).toBe(8 * 3840);
  });
  it('extends to the next whole bar when a note runs past the end', () => {
    expect(contentTicksFor(2, FOUR_FOUR, 3 * 3840 + 1)).toBe(4 * 3840);
  });
  it('uses the bar length of the time signature', () => {
    expect(contentTicksFor(4, { numerator: 3, denominator: 4 }, 0)).toBe(4 * 2880);
    expect(contentTicksFor(4, { numerator: 6, denominator: 8 }, 0)).toBe(4 * 2880);
  });
});

describe('clampViewport', () => {
  it('returns the same object when already legal', () => {
    const v = vp({ scrollTick: 100, scrollY: 300 });
    expect(clampViewport(v, SIZE, CONTENT)).toBe(v);
  });

  it('cannot scroll before the start or past the end', () => {
    expect(clampViewport(vp({ scrollTick: -500 }), SIZE, CONTENT).scrollTick).toBe(0);
    const end = clampViewport(vp({ scrollTick: 1e9 }), SIZE, CONTENT);
    expect(end.scrollTick).toBeCloseTo(CONTENT - SIZE.width / 0.1, 9);
    // the right edge of the view is exactly the end of the content
    expect(tickToX(end, CONTENT)).toBeCloseTo(SIZE.width, 6);
  });

  it('cannot scroll above pitch 127 or below pitch 0', () => {
    expect(clampViewport(vp({ scrollY: -10 }), SIZE, CONTENT).scrollY).toBe(0);
    const bottom = clampViewport(vp({ scrollY: 1e9 }), SIZE, CONTENT);
    expect(bottom.scrollY).toBe(PITCH_COUNT * 16 - SIZE.height);
    expect(pitchToY(bottom, 0) + 16).toBe(SIZE.height);
  });

  it('limits zoom: at most 0.5 px/tick, and no further out than the whole song fitting', () => {
    expect(clampViewport(vp({ pxPerTick: 10 }), SIZE, CONTENT).pxPerTick).toBe(PX_PER_TICK_MAX);
    expect(clampViewport(vp({ pxPerTick: 1e-6 }), SIZE, CONTENT).pxPerTick).toBeCloseTo(SIZE.width / CONTENT, 12);
    expect(clampViewport(vp({ rowHeight: 500 }), SIZE, CONTENT).rowHeight).toBe(ROW_HEIGHT_MAX);
    expect(clampViewport(vp({ rowHeight: 1 }), SIZE, CONTENT).rowHeight).toBe(ROW_HEIGHT_MIN);
  });

  it('never zooms out further than the floor, however long the song', () => {
    const huge = 64 * 3840 * 100;
    expect(minPxPerTick(SIZE, huge)).toBe(PX_PER_TICK_FLOOR);
  });

  it('lets a tall view show all 128 rows without empty space below', () => {
    const tall: Size = { width: 800, height: 1500 };
    expect(minRowHeight(tall)).toBeCloseTo(1500 / 128, 9);
    const clamped = clampViewport(vp({ rowHeight: 8, scrollY: 50 }), tall, CONTENT);
    expect(clamped.rowHeight).toBeCloseTo(1500 / 128, 9);
    expect(clamped.scrollY).toBeCloseTo(0, 6);
  });

  it('copes with a content shorter than the view (no scrolling at all)', () => {
    const short = clampViewport(vp({ scrollTick: 5000 }), { width: 2000, height: 400 }, 3840);
    expect(short.scrollTick).toBe(0);
  });

  it('replaces NaN and Infinity with sane values', () => {
    const bad = clampViewport({ scrollTick: NaN, scrollY: Infinity, pxPerTick: NaN, rowHeight: NaN }, SIZE, CONTENT);
    for (const k of ['scrollTick', 'scrollY', 'pxPerTick', 'rowHeight'] as const) expect(Number.isFinite(bad[k])).toBe(true);
    expect(bad.pxPerTick).toBe(DEFAULT_PX_PER_TICK);
  });

  it('copes with a zero-sized view (not laid out yet)', () => {
    const v = clampViewport(vp(), { width: 0, height: 0 }, CONTENT);
    expect(Number.isFinite(v.scrollTick) && Number.isFinite(v.scrollY)).toBe(true);
  });
});

describe('visibleRange', () => {
  it('reports the tick window and the pitches on screen', () => {
    const v = vp({ scrollTick: 1000, scrollY: 16 * 10 }); // top row is pitch 117
    const r = visibleRange(v, SIZE);
    expect(r.tickFrom).toBe(1000);
    expect(r.tickTo).toBe(1000 + 8000);
    expect(r.pitchHi).toBe(117);
    expect(r.pitchLo).toBe(117 - 24); // 400 / 16 = 25 rows → 117 … 93
  });

  it('counts a partly visible bottom row', () => {
    const r = visibleRange(vp({ scrollY: 8 }), { width: 100, height: 40 });
    expect(r.pitchHi).toBe(127);
    expect(r.pitchLo).toBe(125); // rows 0, 1 and the top half of 2
  });

  it('is clamped to the keyboard', () => {
    const r = visibleRange(vp(), { width: 100, height: 100000 });
    expect(r.pitchLo).toBe(0);
    expect(r.pitchHi).toBe(127);
  });
});

describe('scrollBy', () => {
  it('moves by pixels, so later and lower for positive deltas', () => {
    const v = scrollBy(vp({ scrollY: 100 }), 50, 20, SIZE, CONTENT);
    expect(v.scrollTick).toBe(500);
    expect(v.scrollY).toBe(120);
  });
  it('clamps at both ends', () => {
    expect(scrollBy(vp(), -100, -100, SIZE, CONTENT)).toEqual(vp());
    const far = scrollBy(vp(), 1e9, 1e9, SIZE, CONTENT);
    expect(far.scrollTick).toBeCloseTo(CONTENT - 8000, 6);
    expect(far.scrollY).toBe(PITCH_COUNT * 16 - 400);
  });
});

describe('zoomAxis', () => {
  it('keeps the tick under the anchor fixed when zooming time', () => {
    const v = vp({ scrollTick: 4000 });
    const anchor = { x: 300, y: 0 };
    const before = xToTick(v, anchor.x);
    const z = zoomAxis(v, 'x', 2, SIZE, CONTENT, anchor);
    expect(z.pxPerTick).toBeCloseTo(0.2, 12);
    expect(xToTick(z, anchor.x)).toBeCloseTo(before, 6);
    const out = zoomAxis(z, 'x', 0.5, SIZE, CONTENT, anchor);
    expect(out.pxPerTick).toBeCloseTo(0.1, 12);
    expect(xToTick(out, anchor.x)).toBeCloseTo(before, 6);
  });

  it('keeps the row under the anchor fixed when zooming pitch', () => {
    const v = vp({ scrollY: 500 });
    const anchor = { x: 0, y: 120 };
    const pitchBefore = yToPitch(v, anchor.y);
    const contentY = (anchor.y + v.scrollY) / v.rowHeight;
    const z = zoomAxis(v, 'y', 1.5, SIZE, CONTENT, anchor);
    expect(z.rowHeight).toBe(24);
    expect((anchor.y + z.scrollY) / z.rowHeight).toBeCloseTo(contentY, 9);
    expect(yToPitch(z, anchor.y)).toBe(pitchBefore);
  });

  it('zooms about the centre by default', () => {
    const v = vp({ scrollTick: 4000 });
    const centreTick = xToTick(v, SIZE.width / 2);
    const z = zoomAxis(v, 'x', 1.25, SIZE, CONTENT);
    expect(xToTick(z, SIZE.width / 2)).toBeCloseTo(centreTick, 6);
  });

  it('stops at the zoom limits instead of drifting', () => {
    let v = vp({ scrollTick: 3000 });
    for (let i = 0; i < 40; i++) v = zoomAxis(v, 'x', 1.25, SIZE, CONTENT);
    expect(v.pxPerTick).toBe(PX_PER_TICK_MAX);
    for (let i = 0; i < 80; i++) v = zoomAxis(v, 'x', 0.8, SIZE, CONTENT);
    expect(v.pxPerTick).toBeCloseTo(SIZE.width / CONTENT, 12);
    expect(v.scrollTick).toBe(0); // fully zoomed out shows everything from the start
    let w = vp();
    for (let i = 0; i < 40; i++) w = zoomAxis(w, 'y', 1.25, SIZE, CONTENT);
    expect(w.rowHeight).toBe(ROW_HEIGHT_MAX);
    for (let i = 0; i < 40; i++) w = zoomAxis(w, 'y', 0.8, SIZE, CONTENT);
    expect(w.rowHeight).toBeCloseTo(minRowHeight(SIZE), 9);
  });

  it('ignores a nonsense factor', () => {
    const v = vp();
    expect(zoomAxis(v, 'x', 0, SIZE, CONTENT)).toBe(v);
    expect(zoomAxis(v, 'x', -2, SIZE, CONTENT)).toBe(v);
    expect(zoomAxis(v, 'y', NaN, SIZE, CONTENT)).toBe(v);
  });

  it('keeps the view legal after every step of a zoom-in then zoom-out sweep', () => {
    let v = vp({ scrollTick: 12345, scrollY: 777 });
    for (let i = 0; i < 30; i++) {
      v = zoomAxis(v, i % 2 ? 'x' : 'y', i < 15 ? 1.3 : 0.7, SIZE, CONTENT, { x: (i * 53) % 800, y: (i * 31) % 400 });
      expect(clampViewport(v, SIZE, CONTENT)).toBe(v);
    }
  });
});

describe('defaultViewport', () => {
  it('starts at bar 1 with middle C in the middle', () => {
    const v = defaultViewport(SIZE, CONTENT);
    expect(v.scrollTick).toBe(0);
    expect(v.pxPerTick).toBe(DEFAULT_PX_PER_TICK);
    const mid = pitchToY(v, 60) + v.rowHeight / 2;
    expect(mid).toBeCloseTo(SIZE.height / 2, 6);
  });
  it('is legal in a small view', () => {
    const small: Size = { width: 300, height: 120 };
    const v = defaultViewport(small, CONTENT);
    expect(clampViewport(v, small, CONTENT)).toBe(v);
  });
});

describe('centreOnPitch', () => {
  it('centres any pitch away from the ends', () => {
    for (const p of [20, 60, 100]) {
      const v = centreOnPitch(vp(), p, SIZE, CONTENT);
      expect(pitchToY(v, p) + v.rowHeight / 2).toBeCloseTo(SIZE.height / 2, 6);
    }
  });
  it('stops at the end of the keyboard', () => {
    expect(centreOnPitch(vp(), 127, SIZE, CONTENT).scrollY).toBe(0);
  });
});

describe('fitToNotes', () => {
  it('is the default view with no notes', () => {
    expect(fitToNotes([], SIZE, CONTENT)).toEqual(defaultViewport(SIZE, CONTENT));
  });

  it('shows every note, horizontally and vertically', () => {
    const notes = [note(55, 3840, 960), note(72, 7680, 480), note(64, 5000, 2000)];
    const v = fitToNotes(notes, SIZE, CONTENT);
    const r = visibleRange(v, SIZE);
    for (const n of notes) {
      expect(n.start).toBeGreaterThanOrEqual(r.tickFrom);
      expect(n.start + n.duration).toBeLessThanOrEqual(r.tickTo);
      expect(n.pitch).toBeGreaterThanOrEqual(r.pitchLo);
      expect(n.pitch).toBeLessThanOrEqual(r.pitchHi);
    }
    expect(clampViewport(v, SIZE, CONTENT)).toBe(v);
  });

  it('actually zooms in on a small cluster', () => {
    const v = fitToNotes([note(60, 3840, 960), note(62, 4800, 960)], SIZE, CONTENT);
    expect(v.pxPerTick).toBeGreaterThan(DEFAULT_PX_PER_TICK);
  });

  it('does not zoom beyond the limits for a single tiny note, and keeps it in view', () => {
    const n = note(60, 1920, 10);
    const v = fitToNotes([n], SIZE, CONTENT);
    expect(v.pxPerTick).toBe(PX_PER_TICK_MAX);
    expect(v.rowHeight).toBe(ROW_HEIGHT_MAX);
    const r = visibleRange(v, SIZE);
    expect(n.start).toBeGreaterThanOrEqual(r.tickFrom);
    expect(n.start).toBeLessThan(r.tickTo);
    expect(n.pitch).toBeGreaterThanOrEqual(r.pitchLo);
    expect(n.pitch).toBeLessThanOrEqual(r.pitchHi);
  });

  it('handles notes at the very start and the edges of the keyboard', () => {
    const notes = [note(0, 0, PPQ), note(127, PPQ, PPQ)];
    const tall: Size = { width: 800, height: 1000 }; // all 128 rows need ≥ 6 px each
    const v = fitToNotes(notes, tall, CONTENT);
    const r = visibleRange(v, tall);
    expect(v.scrollTick).toBe(0);
    expect(r.pitchLo).toBe(0);
    expect(r.pitchHi).toBe(127);
    expect(clampViewport(v, tall, CONTENT)).toBe(v);
  });

  it('fits notes that run past the song end when the content has been extended', () => {
    const notes = [note(60, 9 * 3840, 3840)];
    const content = contentTicksFor(8, FOUR_FOUR, 10 * 3840);
    const v = fitToNotes(notes, SIZE, content);
    const r = visibleRange(v, SIZE);
    expect(notes[0]!.start).toBeGreaterThanOrEqual(r.tickFrom);
    expect(notes[0]!.start + notes[0]!.duration).toBeLessThanOrEqual(r.tickTo);
  });
});
