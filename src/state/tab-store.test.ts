import { describe, expect, it } from 'vitest';
import { createTabStore, TAB_STORAGE_KEY } from './tab-store';

const memory = (initial?: string) => {
  const m = new Map<string, string>(initial ? [[TAB_STORAGE_KEY, initial]] : []);
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('tab store', () => {
  it('starts on Sound, remembers a selection, and restores it', () => {
    const storage = memory();
    const s = createTabStore(storage);
    expect(s.getState().tab).toBe('sound');
    s.getState().select('effects');
    expect(storage.m.get(TAB_STORAGE_KEY)).toBe('effects');
    expect(createTabStore(storage).getState().tab).toBe('effects');
  });

  it('ignores an unknown stored value', () => {
    expect(createTabStore(memory('bogus')).getState().tab).toBe('sound');
  });

  it('falls back to the default when storage throws', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const s = createTabStore(broken);
    expect(s.getState().tab).toBe('sound');
    s.getState().select('shape');
    expect(s.getState().tab).toBe('shape');
  });

  it('works with no storage at all', () => {
    expect(createTabStore(null).getState().tab).toBe('sound');
  });
});
