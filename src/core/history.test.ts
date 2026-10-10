import { describe, expect, it, vi } from 'vitest';
import { History, type Command } from './history';

type S = Record<string, number>;

/** A state holder plus a History over it, with a controllable clock. */
function make(initial: S = { a: 0, b: 0 }, opts: { limit?: number; coalesceMs?: number } = {}) {
  let state: S = initial;
  let clock = 0;
  const h = new History<S>({ get: () => state, set: (s) => (state = s) }, { ...opts, now: () => clock });
  return {
    h,
    get state() {
      return state;
    },
    tick: (ms: number) => (clock += ms),
  };
}
const setTo = (key: string, from: number, to: number, coalesce = true): Command<S> => ({
  label: `Set ${key}`,
  coalesceKey: coalesce ? `p:${key}` : undefined,
  undo: (s) => ({ ...s, [key]: from }),
  redo: (s) => ({ ...s, [key]: to }),
});

describe('History basics', () => {
  it('execute applies, undo reverts, redo reapplies', () => {
    const m = make();
    m.h.execute(setTo('a', 0, 5));
    expect(m.state.a).toBe(5);
    expect(m.h.undo()).toBe(true);
    expect(m.state.a).toBe(0);
    expect(m.h.redo()).toBe(true);
    expect(m.state.a).toBe(5);
  });

  it('undo and redo with nothing to do return false and change nothing', () => {
    const m = make();
    expect(m.h.undo()).toBe(false);
    expect(m.h.redo()).toBe(false);
    expect(m.state).toEqual({ a: 0, b: 0 });
  });

  it('a new edit after an undo discards the redo history', () => {
    const m = make();
    m.h.execute(setTo('a', 0, 1, false));
    m.h.execute(setTo('a', 1, 2, false));
    m.h.undo();
    expect(m.h.snapshot().canRedo).toBe(true);
    m.h.execute(setTo('b', 0, 9, false));
    expect(m.h.snapshot().canRedo).toBe(false);
    expect(m.h.snapshot().undoDepth).toBe(2);
  });

  it('reports labels for the next undo and redo', () => {
    const m = make();
    expect(m.h.snapshot()).toMatchObject({ canUndo: false, undoLabel: null });
    m.h.execute({ ...setTo('a', 0, 1, false), label: 'Change Cutoff' });
    expect(m.h.snapshot().undoLabel).toBe('Change Cutoff');
    m.h.undo();
    expect(m.h.snapshot()).toMatchObject({ canUndo: false, canRedo: true, redoLabel: 'Change Cutoff' });
  });

  it('record() logs a change that was already made, without applying it again', () => {
    const m = make();
    const spy = vi.fn();
    m.h.subscribe(spy);
    // simulate a drag that already changed the state
    m.h.record(setTo('a', 0, 7, false));
    expect(spy).toHaveBeenCalled();
    expect(m.state.a).toBe(0); // record() does not touch state
    m.h.undo();
    expect(m.state.a).toBe(0);
  });

  it('clear forgets everything', () => {
    const m = make();
    m.h.execute(setTo('a', 0, 1, false));
    m.h.clear();
    expect(m.h.snapshot()).toMatchObject({ canUndo: false, canRedo: false });
  });
});

describe('coalescing a drag into one entry', () => {
  it('same-key edits close together are one undo step', () => {
    const m = make();
    for (let v = 1; v <= 20; v++) {
      m.h.execute(setTo('a', v - 1, v));
      m.tick(16); // a pointer-move every frame
    }
    expect(m.h.snapshot().undoDepth).toBe(1);
    expect(m.state.a).toBe(20);
    m.h.undo();
    expect(m.state.a).toBe(0); // the whole drag, in one step
    m.h.redo();
    expect(m.state.a).toBe(20);
  });

  it('a pause longer than the window starts a new entry', () => {
    const m = make(undefined, { coalesceMs: 500 });
    m.h.execute(setTo('a', 0, 1));
    m.tick(900);
    m.h.execute(setTo('a', 1, 2));
    expect(m.h.snapshot().undoDepth).toBe(2);
  });

  it('different keys never merge', () => {
    const m = make();
    m.h.execute(setTo('a', 0, 1));
    m.h.execute(setTo('b', 0, 1));
    expect(m.h.snapshot().undoDepth).toBe(2);
  });

  it('commands without a key never merge', () => {
    const m = make();
    m.h.execute(setTo('a', 0, 1, false));
    m.h.execute(setTo('a', 1, 2, false));
    expect(m.h.snapshot().undoDepth).toBe(2);
  });

  it('endGesture() splits otherwise-mergeable edits (pointer up)', () => {
    const m = make();
    m.h.execute(setTo('a', 0, 1));
    m.h.endGesture();
    m.h.execute(setTo('a', 1, 2));
    expect(m.h.snapshot().undoDepth).toBe(2);
  });

  it('an edit right after an undo does not merge into the entry that was undone', () => {
    const m = make();
    m.h.execute(setTo('a', 0, 1));
    m.h.execute(setTo('b', 0, 1));
    m.h.undo();
    m.h.execute(setTo('b', 0, 5));
    m.h.undo();
    expect(m.state).toEqual({ a: 1, b: 0 });
  });
});

describe('group: several commands as one step', () => {
  it('undoes and redoes as a unit, in the right order', () => {
    const m = make();
    m.h.group('Load preset', () => {
      m.h.execute(setTo('a', 0, 1, false));
      m.h.execute(setTo('b', 0, 2, false));
      m.h.execute(setTo('a', 1, 3, false));
    });
    expect(m.h.snapshot()).toMatchObject({ undoDepth: 1, undoLabel: 'Load preset' });
    expect(m.state).toEqual({ a: 3, b: 2 });
    m.h.undo();
    expect(m.state).toEqual({ a: 0, b: 0 });
    m.h.redo();
    expect(m.state).toEqual({ a: 3, b: 2 });
  });

  it('nested groups collapse into the outer one, and an empty group records nothing', () => {
    const m = make();
    m.h.group('outer', () => {
      m.h.group('inner', () => m.h.execute(setTo('a', 0, 1, false)));
      m.h.execute(setTo('b', 0, 1, false));
    });
    expect(m.h.snapshot()).toMatchObject({ undoDepth: 1, undoLabel: 'outer' });
    m.h.group('nothing', () => {});
    expect(m.h.snapshot().undoDepth).toBe(1);
  });

  it('still records if the body throws part-way', () => {
    const m = make();
    expect(() =>
      m.h.group('boom', () => {
        m.h.execute(setTo('a', 0, 4, false));
        throw new Error('x');
      }),
    ).toThrow('x');
    m.h.undo();
    expect(m.state.a).toBe(0);
  });
});

describe('limit', () => {
  it('keeps only the most recent entries', () => {
    const m = make({ a: 0, b: 0 }, { limit: 200 });
    for (let i = 1; i <= 250; i++) m.h.execute(setTo('a', i - 1, i, false));
    expect(m.h.snapshot().undoDepth).toBe(200);
    while (m.h.undo());
    expect(m.state.a).toBe(50); // the first 50 edits can no longer be undone
  });
});

// ── property test ─────────────────────────────────────────────────────────────────────────────

function rng(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

describe('property: any edit sequence can be fully undone to the exact start and redone to the end', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`seed ${seed}`, () => {
      const rand = rng(seed * 7919);
      const initial: S = { a: 0, b: 0, c: 0, d: 0 };
      const m = make(initial, { limit: 10_000, coalesceMs: 100 });
      const keys = ['a', 'b', 'c', 'd'];
      for (let i = 0; i < 400; i++) {
        const r = rand();
        m.tick(rand() < 0.5 ? 10 : 300);
        if (r < 0.6) {
          const k = keys[Math.floor(rand() * keys.length)]!;
          const to = Math.floor(rand() * 100);
          m.h.execute(setTo(k, m.state[k]!, to, rand() < 0.7));
        } else if (r < 0.7) {
          m.h.group('multi', () => {
            for (const k of keys.slice(0, 1 + Math.floor(rand() * 3)))
              m.h.execute(setTo(k, m.state[k]!, Math.floor(rand() * 100), false));
          });
        } else if (r < 0.8) m.h.endGesture();
        else if (r < 0.9) m.h.undo();
        else m.h.redo();
      }
      // Redo everything that can be redone, remember where we end up, then undo it all.
      while (m.h.redo());
      const final = { ...m.state };
      let steps = 0;
      while (m.h.undo()) steps++;
      expect(m.state).toEqual(initial);
      expect(steps).toBeGreaterThan(0);
      while (m.h.redo());
      expect(m.state).toEqual(final);
    });
  }
});
