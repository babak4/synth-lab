import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, type Project } from '@/core/contracts/project';
import { bindPatchToProject, createProjectStore } from './project-store';
import { AUTOSAVE_DEBOUNCE_MS, PROJECT_BACKUP_KEY, PROJECT_STORAGE_KEY, createProjectPersistence } from './persistence';
import { createBrokenStorage, createMemoryStorage, type KeyValueStorage } from './storage';
import { createPatchStore } from './patch-store';

/** Storage that counts writes, so debouncing can be asserted. */
function countingStorage(inner: KeyValueStorage) {
  const writes: string[] = [];
  return {
    writes,
    get: inner.get,
    del: inner.del,
    keys: inner.keys,
    set: async (key: string, value: unknown) => {
      writes.push(key);
      await inner.set(key, value);
    },
  } satisfies KeyValueStorage & { writes: string[] };
}

const savedProject = (name = 'Saved song'): Project => ({ ...createProject(), name, tempo: 133 });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Let pending promises (storage writes) settle under fake timers. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('autosave', () => {
  it('debounces a burst of changes into one write, after the pause', async () => {
    const projectStore = createProjectStore();
    const storage = countingStorage(createMemoryStorage());
    const p = createProjectPersistence({ projectStore, storage });
    p.start(new EventTarget());

    for (let bpm = 100; bpm < 110; bpm++) {
      projectStore.getState().setTempo(bpm);
      vi.advanceTimersByTime(50); // a knob drag: changes faster than the debounce
    }
    await settle();
    expect(storage.writes).toEqual([]);
    expect(p.store.getState().status).toBe('saving');

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await settle();
    expect(storage.writes).toEqual([PROJECT_STORAGE_KEY]);
    expect(p.store.getState().status).toBe('saved');
    expect(p.store.getState().savedAt).not.toBeNull();
    p.dispose();
  });

  it('still saves during a long continuous drag (maximum wait)', async () => {
    const projectStore = createProjectStore();
    const storage = countingStorage(createMemoryStorage());
    const p = createProjectPersistence({ projectStore, storage, maxWaitMs: 2000 });
    p.start(new EventTarget());
    for (let i = 0; i < 40; i++) {
      projectStore.getState().setTempo(60 + (i % 100));
      vi.advanceTimersByTime(100); // never pauses long enough for the debounce
    }
    await settle();
    expect(storage.writes.length).toBeGreaterThanOrEqual(1);
    p.dispose();
  });

  it('writes what is in the store when it fires, not what was there at the first change', async () => {
    const projectStore = createProjectStore();
    const inner = createMemoryStorage();
    const p = createProjectPersistence({ projectStore, storage: inner });
    p.start(new EventTarget());
    projectStore.getState().setTempo(99);
    projectStore.getState().setTempo(101);
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await settle();
    expect(((await inner.get(PROJECT_STORAGE_KEY)) as Project).tempo).toBe(101);
    p.dispose();
  });

  it('a patch edit (knob drag) reaches the saved project through the bound track', async () => {
    const patchStore = createPatchStore();
    const projectStore = createProjectStore();
    bindPatchToProject(patchStore, projectStore);
    const inner = createMemoryStorage();
    const p = createProjectPersistence({ projectStore, storage: inner });
    p.start(new EventTarget());
    patchStore.getState().setParam('filter-cutoff', 640);
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await settle();
    const saved = (await inner.get(PROJECT_STORAGE_KEY)) as Project;
    expect(saved.tracks[0]!.patch.params['filter-cutoff']).toBe(640);
    p.dispose();
  });

  it('flushes a pending change when the page is hidden', async () => {
    const projectStore = createProjectStore();
    const inner = createMemoryStorage();
    const target = new EventTarget();
    const p = createProjectPersistence({ projectStore, storage: inner });
    p.start(target);
    projectStore.getState().setTempo(77);
    target.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(((await inner.get(PROJECT_STORAGE_KEY)) as Project).tempo).toBe(77);
    p.dispose();
  });

  it('flush() writes at once and resolves after the write', async () => {
    const projectStore = createProjectStore();
    const inner = createMemoryStorage();
    const p = createProjectPersistence({ projectStore, storage: inner });
    p.start(new EventTarget());
    projectStore.getState().setTempo(88);
    await p.flush();
    expect(((await inner.get(PROJECT_STORAGE_KEY)) as Project).tempo).toBe(88);
    p.dispose();
  });

  it('does not write when nothing changed', async () => {
    const projectStore = createProjectStore();
    const storage = countingStorage(createMemoryStorage());
    const p = createProjectPersistence({ projectStore, storage });
    p.start(new EventTarget());
    projectStore.getState().selectTrack(projectStore.getState().selectedTrackId); // no project change
    await p.flush();
    expect(storage.writes).toEqual([]);
    p.dispose();
  });

  it('reports "error" when the write fails and retries on the next change', async () => {
    const projectStore = createProjectStore();
    const inner = createMemoryStorage();
    let failing = true;
    const storage: KeyValueStorage = {
      ...inner,
      set: async (key, value) => {
        if (failing) throw new Error('quota');
        await inner.set(key, value);
      },
    };
    const p = createProjectPersistence({ projectStore, storage });
    p.start(new EventTarget());
    projectStore.getState().setTempo(90);
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await settle();
    expect(p.store.getState().status).toBe('error');

    failing = false;
    projectStore.getState().setTempo(91);
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    await settle();
    expect(p.store.getState().status).toBe('saved');
    expect(((await inner.get(PROJECT_STORAGE_KEY)) as Project).tempo).toBe(91);
    p.dispose();
  });

  it('dispose stops following the project', async () => {
    const projectStore = createProjectStore();
    const storage = countingStorage(createMemoryStorage());
    const p = createProjectPersistence({ projectStore, storage });
    p.start(new EventTarget());
    p.dispose();
    projectStore.getState().setTempo(50);
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 10);
    await settle();
    expect(storage.writes).toEqual([]);
  });
});

describe('restore', () => {
  it('loads the saved project into the store', async () => {
    const projectStore = createProjectStore();
    const p = createProjectPersistence({ projectStore, storage: createMemoryStorage({ [PROJECT_STORAGE_KEY]: savedProject() }) });
    await p.restore();
    expect(projectStore.getState().project.name).toBe('Saved song');
    expect(projectStore.getState().project.tempo).toBe(133);
    expect(p.store.getState().notice).toBeNull();
  });

  it('keeps the fresh project on a first visit', async () => {
    const projectStore = createProjectStore();
    const before = projectStore.getState().project;
    const p = createProjectPersistence({ projectStore, storage: createMemoryStorage() });
    await p.restore();
    expect(projectStore.getState().project).toBe(before);
    expect(p.store.getState().notice).toBeNull();
  });

  it('corrupt data: keeps a backup, starts fresh, shows a notice and replaces the bad copy', async () => {
    const projectStore = createProjectStore();
    const inner = createMemoryStorage({ [PROJECT_STORAGE_KEY]: { schemaVersion: 1, name: 42 } });
    const p = createProjectPersistence({ projectStore, storage: inner });
    await p.restore();
    expect(projectStore.getState().project.name).toBe('Untitled');
    expect(p.store.getState().notice).toMatch(/^Your saved project could not be read \(name: should be string/);
    expect(p.store.getState().notice).toContain('kept as a backup');
    expect(inner.dump()[PROJECT_BACKUP_KEY]).toEqual({ schemaVersion: 1, name: 42 });
    expect(((await inner.get(PROJECT_STORAGE_KEY)) as Project).name).toBe('Untitled');
    p.dispose();
  });

  it('a project from an unknown future version is treated as unreadable', async () => {
    const projectStore = createProjectStore();
    const p = createProjectPersistence({
      projectStore,
      storage: createMemoryStorage({ [PROJECT_STORAGE_KEY]: { ...savedProject(), schemaVersion: 9 } }),
    });
    await p.restore();
    expect(projectStore.getState().project.name).toBe('Untitled');
    expect(p.store.getState().notice).toContain('could not be read');
  });

  it('a storage that throws on read does not throw: notice, error status, app still usable', async () => {
    const projectStore = createProjectStore();
    const p = createProjectPersistence({ projectStore, storage: createBrokenStorage() });
    await expect(p.restore()).resolves.toBeUndefined();
    expect(p.store.getState().status).toBe('error');
    expect(p.store.getState().notice).toContain('Browser storage is unavailable');
    projectStore.getState().setTempo(100); // still editable
    expect(projectStore.getState().project.tempo).toBe(100);
  });

  it('a storage that throws on write during backup still starts fresh and says the copy was not kept', async () => {
    const projectStore = createProjectStore();
    const broken = createBrokenStorage();
    const readOnly: KeyValueStorage = { ...broken, get: async <T,>() => 'not a project' as T };
    const p = createProjectPersistence({ projectStore, storage: readOnly });
    await p.restore();
    expect(p.store.getState().notice).toContain('could not be kept');
    p.dispose();
  });

  it('dismissNotice clears the notice', async () => {
    const projectStore = createProjectStore();
    const p = createProjectPersistence({ projectStore, storage: createMemoryStorage({ [PROJECT_STORAGE_KEY]: 'junk' }) });
    await p.restore();
    expect(p.store.getState().notice).not.toBeNull();
    p.store.getState().dismissNotice();
    expect(p.store.getState().notice).toBeNull();
  });
});
