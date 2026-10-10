import { describe, expect, it } from 'vitest';
import { createHelpStore } from './help-store';

describe('help store', () => {
  it('starts closed, opens an entry, and records it', () => {
    const s = createHelpStore();
    expect(s.getState().isOpen).toBe(false);
    expect(s.getState().current).toBeNull();
    s.getState().open('filter');
    expect(s.getState()).toMatchObject({ isOpen: true, current: 'filter', canBack: false, canForward: false });
  });

  it('navigates back and forward through entries', () => {
    const s = createHelpStore();
    for (const id of ['filter', 'filter-cutoff', 'envelopes']) s.getState().open(id);
    s.getState().back();
    expect(s.getState().current).toBe('filter-cutoff');
    s.getState().back();
    expect(s.getState().current).toBe('filter');
    expect(s.getState().canBack).toBe(false);
    s.getState().back(); // no-op at the start
    expect(s.getState().current).toBe('filter');
    s.getState().forward();
    s.getState().forward();
    expect(s.getState().current).toBe('envelopes');
    expect(s.getState().canForward).toBe(false);
  });

  it('opening a new entry after going back drops the forward history', () => {
    const s = createHelpStore();
    for (const id of ['a', 'b', 'c']) s.getState().open(id);
    s.getState().back();
    s.getState().open('d');
    expect(s.getState().history).toEqual(['a', 'b', 'd']);
    expect(s.getState().canForward).toBe(false);
  });

  it('re-opening the entry already shown does not add history', () => {
    const s = createHelpStore();
    s.getState().open('a');
    s.getState().open('a');
    expect(s.getState().history).toEqual(['a']);
  });

  it('close keeps history so the drawer reopens where you left off in the back stack', () => {
    const s = createHelpStore();
    s.getState().open('a');
    s.getState().open('b');
    s.getState().close();
    expect(s.getState()).toMatchObject({ isOpen: false, current: null });
    s.getState().open('c');
    expect(s.getState().history).toEqual(['a', 'b', 'c']);
  });

  it('remembers scroll per entry', () => {
    const s = createHelpStore();
    s.getState().saveScroll('filter', 240);
    s.getState().saveScroll('lfo', 40);
    expect(s.getState().scroll).toEqual({ filter: 240, lfo: 40 });
  });
});
