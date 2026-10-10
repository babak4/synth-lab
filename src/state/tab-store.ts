/** Which tab is open (plan T2.7). UI state only; remembered per viewer in localStorage, never in a patch. */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { DEFAULT_TAB, isTabId, type TabId } from '@/core/tabs';

export const TAB_STORAGE_KEY = 'synth-lab:tab';

export interface TabState {
  tab: TabId;
  select(tab: TabId): void;
}
export type TabStore = StoreApi<TabState>;

/** Storage can be missing or throw (private windows, blocked site data); fall back to the default tab. */
export function createTabStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage()): TabStore {
  let initial: TabId = DEFAULT_TAB;
  try {
    const saved = storage?.getItem(TAB_STORAGE_KEY);
    if (isTabId(saved)) initial = saved;
  } catch {
    /* default */
  }
  return createStore<TabState>()((set, get) => ({
    tab: initial,
    select(tab) {
      if (get().tab === tab) return;
      set({ tab });
      try {
        storage?.setItem(TAB_STORAGE_KEY, tab);
      } catch {
        /* a convenience only */
      }
    },
  }));
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
