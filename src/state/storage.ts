/**
 * Minimal async key-value storage. The real thing is IndexedDB (via idb-keyval); tests use memory.
 * Everything the app stores (user presets, autosaved project) goes through this interface.
 */
import { createStore, del, get, keys, set } from 'idb-keyval';

export interface KeyValueStorage {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export function createIdbStorage(dbName = 'synth-lab', storeName = 'kv'): KeyValueStorage {
  const store = createStore(dbName, storeName);
  return {
    get: <T,>(key: string) => get<T>(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
    keys: async () => (await keys(store)).map(String),
  };
}

export function createMemoryStorage(initial: Record<string, unknown> = {}): KeyValueStorage & { dump(): Record<string, unknown> } {
  const m = new Map<string, unknown>(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  return {
    get: async <T,>(key: string) => (m.has(key) ? (structuredClone(m.get(key)) as T) : undefined),
    set: async (key, value) => void m.set(key, structuredClone(value)),
    del: async (key) => void m.delete(key),
    keys: async () => [...m.keys()],
    dump: () => Object.fromEntries(m),
  };
}

/** A storage that fails every call, for testing error paths (private windows, blocked site data). */
export function createBrokenStorage(): KeyValueStorage {
  const fail = async (): Promise<never> => {
    throw new Error('storage unavailable');
  };
  return { get: fail, set: fail, del: fail, keys: fail };
}
