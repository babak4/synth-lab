/**
 * Autosave (plan T5.7, PRD §6.5): the project is written to browser storage a moment after it changes,
 * and read back on startup. Knob drags change the project many times a second, so writes are debounced
 * (with a maximum wait, so a long drag still saves), and flushed when the page is hidden or closed.
 *
 * Restore never throws. Unreadable data is kept under a backup key and the app starts a fresh project,
 * with a notice the UI shows. Storage that is missing or blocked only turns the status to "error".
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { parseProjectData } from '@/core/project-file';
import type { Project } from '@/core/contracts/project';
import type { ProjectStore } from './project-store';
import type { KeyValueStorage } from './storage';

export const PROJECT_STORAGE_KEY = 'project:current';
export const PROJECT_BACKUP_KEY = 'project:backup';
export const AUTOSAVE_DEBOUNCE_MS = 500;
export const AUTOSAVE_MAX_WAIT_MS = 5000;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface PersistenceState {
  status: SaveStatus;
  savedAt: number | null;
  /** Set when the saved project could not be restored, or storage is unavailable. Dismissed by the user. */
  notice: string | null;
  dismissNotice(): void;
}

export interface ProjectPersistence {
  store: StoreApi<PersistenceState>;
  /** Load the saved project into the project store. Call once, before anything depends on the tracks. */
  restore(): Promise<void>;
  /** Follow the project and save it. `page` receives pagehide / visibilitychange (window in the browser). */
  start(page?: EventTarget): void;
  /** Write any pending change now; resolves when the write has finished (or failed). */
  flush(): Promise<void>;
  dispose(): void;
}

export interface PersistenceDeps {
  projectStore: ProjectStore;
  storage: KeyValueStorage;
  debounceMs?: number;
  maxWaitMs?: number;
}

const STORAGE_UNAVAILABLE =
  'Browser storage is unavailable, so this project is not saved automatically. Use Save file… to keep a copy.';

export function createProjectPersistence(deps: PersistenceDeps): ProjectPersistence {
  const { projectStore, storage } = deps;
  const debounceMs = deps.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const maxWaitMs = deps.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS;

  const store = createStore<PersistenceState>()((set) => ({
    status: 'idle',
    savedAt: null,
    notice: null,
    dismissNotice: () => set({ notice: null }),
  }));

  let dirty = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let lastWritten: Project | null = null;
  let writing: Promise<void> = Promise.resolve();
  let unsubscribe: (() => void) | null = null;
  let page: EventTarget | null = null;

  const clearTimers = () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    if (maxWaitTimer !== null) clearTimeout(maxWaitTimer);
    debounceTimer = null;
    maxWaitTimer = null;
  };

  /** Queue a write of the project as it is now. Writes run one after another, so the last one wins. */
  const save = (): Promise<void> => {
    clearTimers();
    if (!dirty) return writing;
    dirty = false;
    const snapshot = projectStore.getState().project;
    writing = writing.then(async () => {
      if (snapshot === lastWritten) {
        store.setState({ status: 'saved' });
        return;
      }
      try {
        await storage.set(PROJECT_STORAGE_KEY, snapshot);
        lastWritten = snapshot;
        store.setState({ status: 'saved', savedAt: Date.now() });
      } catch {
        dirty = true; // try again on the next change, or when the page is hidden
        store.setState({ status: 'error' });
      }
    });
    return writing;
  };

  const onChange = () => {
    dirty = true;
    store.setState({ status: 'saving' });
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void save(), debounceMs);
    maxWaitTimer ??= setTimeout(() => void save(), maxWaitMs);
  };

  const onPageHide = () => void save();
  // visibilitychange also fires when the page comes back; only hiding needs a flush.
  const onVisibility = () => {
    if (globalThis.document?.visibilityState !== 'visible') void save();
  };

  return {
    store,

    async restore() {
      let raw: unknown;
      try {
        raw = await storage.get(PROJECT_STORAGE_KEY);
      } catch {
        store.setState({ status: 'error', notice: STORAGE_UNAVAILABLE });
        return;
      }
      if (raw === undefined) return; // first visit: keep the fresh project

      const result = parseProjectData(raw);
      if (result.ok) {
        projectStore.getState().loadProject(result.value);
        return;
      }

      // Unreadable (old, corrupt or from a newer version). Keep the bytes as a backup, then start fresh.
      let kept = true;
      try {
        await storage.set(PROJECT_BACKUP_KEY, raw);
      } catch {
        kept = false;
      }
      store.setState({
        notice: `Your saved project could not be read (${result.error}). ${
          kept ? 'A new project was started, and the unreadable copy was kept as a backup.' : 'A new project was started. The unreadable copy could not be kept.'
        }`,
      });
      // The fresh project is already in the store; saving it replaces the unreadable copy.
      dirty = true;
      await save();
    },

    start(target = globalThis.window) {
      if (unsubscribe) return;
      page = target ?? null;
      unsubscribe = projectStore.subscribe((s, prev) => {
        if (s.project !== prev.project) onChange();
      });
      page?.addEventListener('pagehide', onPageHide);
      page?.addEventListener('visibilitychange', onVisibility);
    },

    flush() {
      if (debounceTimer !== null || maxWaitTimer !== null || dirty) return save();
      return writing;
    },

    dispose() {
      clearTimers();
      unsubscribe?.();
      unsubscribe = null;
      page?.removeEventListener('pagehide', onPageHide);
      page?.removeEventListener('visibilitychange', onVisibility);
      page = null;
    },
  };
}
