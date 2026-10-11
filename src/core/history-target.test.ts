import { describe, expect, it, vi } from 'vitest';
import { History, type Command } from './history';

type S = { n: number };
const add = (by: number, extra: Partial<Command<S>> = {}): Command<S> => ({ label: `add ${by}`, undo: (s) => ({ n: s.n - by }), redo: (s) => ({ n: s.n + by }), ...extra });

function make(onApply?: (cmd: Command<S>, direction: 'undo' | 'redo') => void) {
  let state: S = { n: 0 };
  let t = 0;
  const h = new History<S>({ get: () => state, set: (s) => (state = s) }, { now: () => (t += 10), onApply });
  return { h, get: () => state };
}

describe('command targets and onApply (what undo selects)', () => {
  it('onApply runs after undo and redo with the command and direction', () => {
    const onApply = vi.fn();
    const { h, get } = make(onApply);
    h.execute(add(5, { target: 'trk_a' }));
    h.undo();
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ target: 'trk_a' }), 'undo');
    expect(get().n).toBe(0);
    h.redo();
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ target: 'trk_a' }), 'redo');
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it('is not called for execute or when there is nothing to undo', () => {
    const onApply = vi.fn();
    const { h } = make(onApply);
    h.undo();
    h.execute(add(1));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('a group keeps the first target, and a merged step keeps the latest', () => {
    const onApply = vi.fn();
    const { h } = make(onApply);
    h.group('two', () => {
      h.execute(add(1));
      h.execute(add(2, { target: 'trk_b' }));
    });
    h.undo();
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'two', target: 'trk_b' }), 'undo');

    h.execute(add(1, { coalesceKey: 'k', target: 'trk_a' }));
    h.execute(add(1, { coalesceKey: 'k', target: 'trk_a' }));
    expect(h.snapshot().undoDepth).toBe(1);
    h.undo();
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ target: 'trk_a' }), 'undo');
  });
});

describe('removeWhere', () => {
  it('drops matching entries from both stacks, keeps order, and the rest still undo and redo', () => {
    const { h, get } = make();
    h.execute(add(1, { target: 'a' }));
    h.endGesture();
    h.execute(add(10, { target: 'b' }));
    h.endGesture();
    h.execute(add(100, { target: 'a' }));
    h.endGesture();
    h.execute(add(1000, { target: 'b' }));
    h.undo(); // the 1000 step is now redoable
    h.removeWhere((c) => c.target === 'b');
    expect(h.snapshot()).toMatchObject({ undoDepth: 2, redoDepth: 0, undoLabel: 'add 100' });
    // What is left is the a-steps: undoing them removes only their own effect from the state.
    h.undo();
    expect(get().n).toBe(10 + 1); // 1 + 10 applied, 100 undone: the b step's effect stays in the state (the caller owns that)
    h.undo();
    h.redo();
    h.redo();
    expect(get().n).toBe(111);
  });

  it('does nothing, and does not notify, when nothing matches', () => {
    const { h } = make();
    h.execute(add(1, { target: 'a' }));
    let calls = 0;
    h.subscribe(() => calls++);
    h.removeWhere((c) => c.target === 'zzz');
    expect(calls).toBe(0);
    expect(h.snapshot().undoDepth).toBe(1);
  });
});
