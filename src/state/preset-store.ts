/**
 * Presets (plan T2.5b): the factory list plus the user's own, which live in IndexedDB. Selecting one
 * loads it into the patch store (and so the engine). Import and export are JSON, validated on the way in.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { bus } from '@/core/contracts/events';
import { PATCH_SCHEMA_VERSION, parsePreset, type Preset } from '@/core/contracts/patch';
import { newId } from '@/core/contracts/project';
import type { PatchParams } from '@/core/params/registry';
import { FACTORY_PRESETS } from '@/presets';
import type { PatchStore } from './patch-store';
import type { KeyValueStorage } from './storage';

const KEY_PREFIX = 'preset:';

export interface PresetState {
  factory: readonly Preset[];
  user: Preset[];
  /** Preset most recently loaded or saved; the "edited" marker compares against it. */
  currentId: string | null;
  ready: boolean;
  /** Last problem (storage failure, bad import file); cleared by the next successful action. */
  message: { kind: 'info' | 'error'; text: string } | null;
  init(): Promise<void>;
  select(id: string): void;
  /** Re-load the current preset, discarding edits ("safe to experiment"). */
  restore(): void;
  saveAs(name: string): Promise<Preset | null>;
  remove(id: string): Promise<void>;
  exportJson(id: string): string | null;
  importJson(text: string): Promise<Preset | null>;
}

export type PresetStore = StoreApi<PresetState>;

export function createPresetStore(deps: { patchStore: PatchStore; storage: KeyValueStorage; factory?: readonly Preset[] }): PresetStore {
  const { patchStore, storage } = deps;
  const factory = deps.factory ?? FACTORY_PRESETS;

  return createStore<PresetState>()((set, get) => {
    const find = (id: string) => [...get().factory, ...get().user].find((p) => p.id === id);
    const info = (text: string) => set({ message: { kind: 'info', text } });
    const fail = (text: string) => set({ message: { kind: 'error', text } });

    /** A free name: "Name", then "Name (2)", "Name (3)"… */
    const uniqueName = (name: string) => {
      const taken = new Set([...get().factory, ...get().user].map((p) => p.name));
      if (!taken.has(name)) return name;
      let n = 2;
      while (taken.has(`${name} (${n})`)) n++;
      return `${name} (${n})`;
    };

    const persist = async (p: Preset) => storage.set(KEY_PREFIX + p.id, p);

    return {
      factory,
      user: [],
      currentId: factory.find((p) => p.id === 'init')?.id ?? null,
      ready: false,
      message: null,

      async init() {
        try {
          const ids = (await storage.keys()).filter((k) => k.startsWith(KEY_PREFIX));
          const loaded: Preset[] = [];
          for (const key of ids) {
            const r = parsePreset(await storage.get(key));
            if (r.ok) loaded.push(r.value); // a corrupt entry is skipped, not fatal
          }
          loaded.sort((a, b) => a.name.localeCompare(b.name));
          set({ user: loaded, ready: true });
        } catch {
          // No storage (private window, blocked site data): factory presets still work.
          set({ ready: true, message: { kind: 'error', text: 'Your saved presets could not be loaded in this browser session.' } });
        }
      },

      select(id) {
        const p = find(id);
        if (!p) return;
        patchStore.getState().loadPatch(p.patch);
        bus.emit('patch:load', {});
        set({ currentId: id, message: null });
      },

      restore() {
        const id = get().currentId;
        if (id) get().select(id);
      },

      async saveAs(name) {
        const trimmed = name.trim();
        if (!trimmed) {
          fail('Give the preset a name.');
          return null;
        }
        const finalName = uniqueName(trimmed.slice(0, 64));
        const patch = { ...structuredClone(patchStore.getState().patch), name: finalName };
        const preset: Preset = { schemaVersion: PATCH_SCHEMA_VERSION, id: `user_${newId('p')}`, name: finalName, patch };
        try {
          await persist(preset);
        } catch {
          fail('Could not save: this browser is blocking local storage. You can still export the preset as a file.');
          return null;
        }
        set({ user: [...get().user, preset].sort((a, b) => a.name.localeCompare(b.name)), currentId: preset.id });
        patchStore.getState().loadPatch(patch); // the edited patch now carries the saved name
        info(`Saved “${finalName}”.`);
        return preset;
      },

      async remove(id) {
        if (!get().user.some((p) => p.id === id)) return; // factory presets cannot be deleted
        try {
          await storage.del(KEY_PREFIX + id);
        } catch {
          fail('Could not delete: this browser is blocking local storage.');
          return;
        }
        set({ user: get().user.filter((p) => p.id !== id), currentId: get().currentId === id ? null : get().currentId });
        info('Deleted.');
      },

      exportJson(id) {
        const p = find(id);
        return p ? JSON.stringify(p, null, 2) : null;
      },

      async importJson(text) {
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          fail('That file is not valid JSON, so nothing was imported.');
          return null;
        }
        const r = parsePreset(raw);
        if (!r.ok) {
          fail(`That is not a Synth Lab preset (${r.error}). Nothing was imported.`);
          return null;
        }
        // Always take a fresh id and a free name so an import can never overwrite something.
        const name = uniqueName(r.value.name);
        const preset: Preset = { ...r.value, id: `user_${newId('p')}`, name, patch: { ...r.value.patch, name } };
        try {
          await persist(preset);
        } catch {
          fail('Could not save the imported preset: this browser is blocking local storage.');
          return null;
        }
        set({ user: [...get().user, preset].sort((a, b) => a.name.localeCompare(b.name)) });
        get().select(preset.id);
        info(`Imported “${name}”.`);
        return preset;
      },
    };
  });
}

/** True when the patch has been edited since the current preset was loaded. */
export function isEdited(state: Pick<PresetState, 'factory' | 'user' | 'currentId'>, params: PatchParams): boolean {
  const cur = [...state.factory, ...state.user].find((p) => p.id === state.currentId);
  if (!cur) return true;
  return (Object.keys(cur.patch.params) as (keyof PatchParams)[]).some((k) => cur.patch.params[k] !== params[k]);
}
