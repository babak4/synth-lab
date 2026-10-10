/**
 * Undo/redo for the patch (plan T5.4). It watches the patch store, so EVERY change is undoable without
 * the callers knowing: knob drags, typed values, preset loads, "Set it up". Continuous drags coalesce
 * into one step. Project edits (notes, tracks) get their own History when the project store exists.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { diffPatchParams, type Patch } from '@/core/contracts/patch';
import { History, type Command } from '@/core/history';
import { getParamDef, type PatchParamId } from '@/core/params/registry';
import type { PatchStore } from './patch-store';

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undo(): void;
  redo(): void;
  /** A gesture (drag, key hold) ended: the next change starts a new undo step. */
  endGesture(): void;
}

export type HistoryStore = StoreApi<HistoryState> & { history: History<Patch>; dispose(): void };

function describeChange(prev: Patch, next: Patch): { label: string; coalesceKey?: string } {
  const changed = Object.keys(diffPatchParams(prev.params, next.params)) as PatchParamId[];
  if (changed.length === 1) {
    const id = changed[0]!;
    return { label: `Change ${getParamDef(id).label}`, coalesceKey: `param:${id}` };
  }
  if (next.name !== prev.name) return { label: `Load “${next.name}”` };
  return { label: changed.length === 0 ? 'Rename patch' : `Change ${changed.length} settings` };
}

export function createHistoryStore(
  patchStore: PatchStore,
  opts?: { limit?: number; coalesceMs?: number; now?: () => number },
): HistoryStore {
  let applying = false;
  const history = new History<Patch>(
    {
      get: () => patchStore.getState().patch,
      set: (patch) => {
        applying = true; // undo/redo writes must not be recorded as new edits
        try {
          patchStore.setState({ patch });
        } finally {
          applying = false;
        }
      },
    },
    opts,
  );

  const store = createStore<HistoryState>()(() => ({
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
    undo: () => void history.undo(),
    redo: () => void history.redo(),
    endGesture: () => history.endGesture(),
  }));
  const sync = () => store.setState(history.snapshot());
  const offHistory = history.subscribe(sync);

  const offPatch = patchStore.subscribe((state, prev) => {
    if (applying || state.patch === prev.patch) return;
    const before = prev.patch;
    const after = state.patch;
    const cmd: Command<Patch> = { ...describeChange(before, after), undo: () => before, redo: () => after };
    history.record(cmd);
  });

  return Object.assign(store, {
    history,
    dispose: () => {
      offHistory();
      offPatch();
    },
  });
}
