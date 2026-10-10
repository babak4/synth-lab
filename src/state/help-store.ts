/**
 * Help drawer navigation (plan T4.1): open/closed, back/forward history, and the scroll position to
 * restore for each entry. "index" is the special id of the entry list.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

export const INDEX_ID = 'index';

export interface HelpState {
  isOpen: boolean;
  history: string[];
  /** Position in `history` of the entry being shown. */
  pos: number;
  scroll: Record<string, number>;
  /** Entry being shown, or null when closed. */
  current: string | null;
  canBack: boolean;
  canForward: boolean;
  open(id: string): void;
  back(): void;
  forward(): void;
  close(): void;
  saveScroll(id: string, y: number): void;
}

export type HelpStore = StoreApi<HelpState>;

export function createHelpStore(): HelpStore {
  const derive = (isOpen: boolean, history: string[], pos: number) => ({
    isOpen,
    history,
    pos,
    current: isOpen ? (history[pos] ?? null) : null,
    canBack: pos > 0,
    canForward: pos < history.length - 1,
  });
  return createStore<HelpState>()((set, get) => ({
    ...derive(false, [], -1),
    scroll: {},
    open(id) {
      const { history, pos, isOpen } = get();
      if (isOpen && history[pos] === id) return;
      // Opening a new entry discards "forward" history, like a browser.
      const next = [...history.slice(0, pos + 1), id];
      set(derive(true, next, next.length - 1));
    },
    back() {
      const { history, pos } = get();
      if (pos > 0) set(derive(true, history, pos - 1));
    },
    forward() {
      const { history, pos } = get();
      if (pos < history.length - 1) set(derive(true, history, pos + 1));
    },
    close() {
      const { history, pos } = get();
      set(derive(false, history, pos));
    },
    saveScroll(id, y) {
      set((s) => ({ scroll: { ...s.scroll, [id]: y } }));
    },
  }));
}
