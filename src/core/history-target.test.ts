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
