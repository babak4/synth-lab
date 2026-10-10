import { describe, expect, it } from 'vitest';
import type { Note } from '../contracts/project';
import {
  MIN_NOTE_WIDTH,
  NOTE_GAP,
  buildNoteIndex,
  indexFor,
  layoutVisibleNotes,
  noteRect,
  queryNotes,
  velocityOpacity,
} from './notes';
import { visibleRange, type Size, type Viewport } from './viewport';

const note = (id: string, pitch: number, start: number, duration: number, velocity = 100): Note => ({ id, pitch, start, duration, velocity });
const VP: Viewport = { scrollTick: 0, scrollY: 0, pxPerTick: 0.1, rowHeight: 16 };
const SIZE: Size = { width: 800, height: 400 };

/** Deterministic pseudo-random numbers so the fuzz test is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomNotes(count: number, seed: number): Note[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) =>
    note(`n${i}`, Math.floor(r() * 128), Math.floor(r() * 64 * 3840), 1 + Math.floor(r() * (r() < 0.05 ? 20000 : 1920)), 1 + Math.floor(r() * 127)),
  );
}

const brute = (notes: Note[], from: number, to: number, lo: number, hi: number) =>
  notes.filter((n) => n.start < to && n.start + n.duration > from && n.pitch >= lo && n.pitch <= hi).map((n) => n.id).sort();

describe('buildNoteIndex', () => {
  it('sorts by start without touching the input', () => {
    const input = [note('c', 61, 960, 100), note('a', 62, 0, 100), note('b', 60, 960, 100)];
    const copy = [...input];
    const idx = buildNoteIndex(input);
    expect(idx.sorted.map((n) => n.id)).toEqual(['a', 'b', 'c']); // ties by pitch
    expect(input).toEqual(copy);
  });
  it('keeps a running maximum of ends and reports the farthest', () => {
    const idx = buildNoteIndex([note('a', 60, 0, 5000), note('b', 60, 100, 50), note('c', 60, 200, 6000)]);
    expect(idx.maxEnd).toEqual([5000, 5000, 6200]);
    expect(idx.farthestEnd).toBe(6200);
  });
  it('copes with no notes', () => {
    const idx = buildNoteIndex([]);
    expect(idx.farthestEnd).toBe(0);
    expect(queryNotes(idx, 0, 1e9, 0, 127)).toEqual([]);
  });
});

describe('indexFor', () => {
  it('caches per array and rebuilds for a new array', () => {
    const a = [note('a', 60, 0, 100)];
    expect(indexFor(a)).toBe(indexFor(a));
    expect(indexFor([...a])).not.toBe(indexFor(a));
  });
});

describe('queryNotes', () => {
  const idx = buildNoteIndex([note('a', 60, 0, 960), note('b', 62, 960, 960), note('c', 64, 1920, 960)]);
  it('includes notes that overlap the window and excludes the rest', () => {
    expect(queryNotes(idx, 500, 1000, 0, 127).map((n) => n.id)).toEqual(['a', 'b']);
    expect(queryNotes(idx, 960, 1920, 0, 127).map((n) => n.id)).toEqual(['b']); // a ends exactly at 960, c starts exactly at 1920
    expect(queryNotes(idx, 3000, 4000, 0, 127)).toEqual([]);
  });
  it('includes a long note that started long before the window', () => {
    const long = buildNoteIndex([note('long', 60, 0, 100000), note('x', 61, 10, 5), note('y', 62, 20, 5)]);
    expect(queryNotes(long, 50000, 51000, 0, 127).map((n) => n.id)).toEqual(['long']);
  });
  it('filters by pitch, inclusive', () => {
    expect(queryNotes(idx, 0, 5000, 62, 64).map((n) => n.id)).toEqual(['b', 'c']);
    expect(queryNotes(idx, 0, 5000, 65, 127)).toEqual([]);
  });
  it('agrees with a brute-force filter on random data and windows', () => {
    const notes = randomNotes(2000, 42);
    const index = buildNoteIndex(notes);
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const from = Math.floor(r() * 64 * 3840);
      const to = from + 1 + Math.floor(r() * 30000);
      const lo = Math.floor(r() * 128);
      const hi = lo + Math.floor(r() * (128 - lo));
      const got = queryNotes(index, from, to, lo, hi).map((n) => n.id).sort();
      expect(got).toEqual(brute(notes, from, to, lo, hi));
    }
  });
});

describe('noteRect', () => {
  it('places the note by time and pitch, leaving a gap', () => {
    const r = noteRect(note('a', 126, 960, 480), VP);
    expect(r.x).toBe(96);
    expect(r.w).toBe(480 * 0.1 - NOTE_GAP);
    expect(r.y).toBe(16 + NOTE_GAP / 2);
    expect(r.h).toBe(16 - NOTE_GAP);
  });
  it('follows scroll', () => {
    const r = noteRect(note('a', 127, 960, 480), { ...VP, scrollTick: 960, scrollY: 8 });
    expect(r.x).toBe(0);
    expect(r.y).toBe(-8 + NOTE_GAP / 2);
  });
  it('never makes a note narrower than MIN_NOTE_WIDTH', () => {
    expect(noteRect(note('a', 60, 0, 1), VP).w).toBe(MIN_NOTE_WIDTH);
  });
  it('has height at least 2 px even when rows are thin', () => {
    expect(noteRect(note('a', 60, 0, 100), { ...VP, rowHeight: 1 }).h).toBe(2);
  });
});

describe('layoutVisibleNotes', () => {
  it('returns only the notes on screen, with their ids and velocities', () => {
    const notes = [
      note('in', 120, 1000, 480, 33), // 100 px from left, row 7
      note('left', 120, -0 + 0, 0 + 1, 10), // starts at 0, 1 tick: visible at the very left edge
      note('later', 120, 100000, 480),
      note('low', 20, 1000, 480),
    ];
    const rects = layoutVisibleNotes(buildNoteIndex(notes), VP, SIZE);
    expect(rects.map((r) => r.id).sort()).toEqual(['in', 'left']);
    expect(rects.find((r) => r.id === 'in')!.velocity).toBe(33);
  });

  it('every returned rectangle intersects the grid area', () => {
    const notes = randomNotes(3000, 99);
    const index = buildNoteIndex(notes);
    for (const vp of [VP, { ...VP, scrollTick: 40000, scrollY: 600, pxPerTick: 0.25 }, { ...VP, scrollTick: 100000, scrollY: 600, pxPerTick: 0.02, rowHeight: 8 }]) {
      for (const r of layoutVisibleNotes(index, vp, SIZE)) {
        expect(r.x + r.w).toBeGreaterThan(0);
        expect(r.x).toBeLessThan(SIZE.width);
        expect(r.y + r.h).toBeGreaterThan(0);
        expect(r.y).toBeLessThan(SIZE.height);
      }
    }
  });

  it('keeps the visible set small and fast with 5,000 notes', () => {
    const notes = randomNotes(5000, 5);
    const index = buildNoteIndex(notes);
    const t0 = performance.now();
    let drawn = 0;
    for (let i = 0; i < 200; i++) drawn += layoutVisibleNotes(index, { ...VP, scrollTick: i * 1000 }, SIZE).length;
    const per = (performance.now() - t0) / 200;
    expect(drawn / 200).toBeLessThan(notes.length / 4);
    expect(per).toBeLessThan(2); // far inside a 16 ms frame
    const r = visibleRange(VP, SIZE);
    expect(r.tickTo - r.tickFrom).toBe(8000);
  });
});

describe('velocityOpacity', () => {
  it('is paler for softer notes and never invisible', () => {
    expect(velocityOpacity(1)).toBeCloseTo(0.3, 9);
    expect(velocityOpacity(127)).toBeCloseTo(1, 9);
    expect(velocityOpacity(40)).toBeLessThan(velocityOpacity(90));
  });
  it('is monotonic over the whole range', () => {
    for (let v = 2; v <= 127; v++) expect(velocityOpacity(v)).toBeGreaterThan(velocityOpacity(v - 1));
  });
  it('clamps out-of-range velocities', () => {
    expect(velocityOpacity(0)).toBeCloseTo(0.3, 9);
    expect(velocityOpacity(500)).toBeCloseTo(1, 9);
  });
});
