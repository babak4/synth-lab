/**
 * Patch store (plan T1.7): the editable patch the synth panel binds to. The UI edits this store;
 * the engine subscribes to it. Neither side imports the other.
 *
 * T5.1 generalises this to "the selected track's patch"; the binding contract stays the same.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createPatch, diffPatchParams, type Patch } from '@/core/contracts/patch';
import type { SynthEngine } from '@/core/contracts/engine';
import type { ParamValue, PatchParamId } from '@/core/params/registry';

export interface PatchState {
  patch: Patch;
  setParam<I extends PatchParamId>(id: I, value: ParamValue<I>): void;
  /** Replace the whole patch (preset load, "Set it up", undo). */
  loadPatch(patch: Patch): void;
  reset(): void;
}

export type PatchStore = StoreApi<PatchState>;

export function createPatchStore(initial: Patch = createPatch()): PatchStore {
  return createStore<PatchState>()((set) => ({
    patch: initial,
    setParam: (id, value) =>
      set((s) => (s.patch.params[id] === value ? s : { patch: { ...s.patch, params: { ...s.patch.params, [id]: value } } })),
    loadPatch: (patch) => set({ patch: structuredClone(patch) }),
    reset: () => set({ patch: createPatch() }),
  }));
}

/** More changed params than this in one update is treated as a whole-patch load. */
const BULK = 6;

/**
 * Push store changes into an engine. The engine is brought in line with the store immediately, then
 * kept in step: single-parameter edits go through setParam (smoothed), bulk changes through loadPatch.
 * Returns an unsubscribe function.
 */
export function bindEngineToPatch(store: PatchStore, engine: SynthEngine): () => void {
  engine.loadPatch(store.getState().patch);
  return store.subscribe((state, prev) => {
    if (state.patch === prev.patch) return;
    const changed = diffPatchParams(prev.patch.params, state.patch.params);
    const ids = Object.keys(changed) as PatchParamId[];
    if (ids.length > BULK) {
      engine.loadPatch(state.patch);
    } else {
      for (const id of ids) engine.setParam(id, changed[id] as never);
    }
  });
}
