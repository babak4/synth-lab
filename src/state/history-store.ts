/**
 * The one undo/redo of the app (plan T5.4, T5.3b): sound edits and note edits share ONE chronological
 * stack, so Cmd/Ctrl+Z always undoes whatever the user did last, wherever they did it.
 *
 * What it edits is the PROJECT document (`History<Project>`). The patch editor writes into the selected
 * track's patch (`bindPatchToProject`), so this store watches the project for tracks whose patch changed
 * and records those, EVERY change without the callers knowing: knob drags, typed values, preset loads,
 * "Set it up". Continuous drags coalesce into one step. Note edits (piano roll) are executed through
 * `history` directly by the piano roll's edit store.
 *
 * Track switching does NOT clear history any more. Every command names the track it belongs to (patch
 * commands replace that track's patch, note commands add/remove notes by id on that track), so a step
 * recorded on track A is applied to track A even while track B is selected; undoing it selects A so the
 * change is visible (`onApply`). History ends when the whole project is replaced (open / new project:
 * `loadGeneration` changes) or when a track is removed (its steps, and the steps' neighbours' meaning,
 * are no longer reliable).
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { diffPatchParams, type Patch } from '@/core/contracts/patch';
import type { Project } from '@/core/contracts/project';
import { History, type Command } from '@/core/history';
import { getParamDef, type PatchParamId } from '@/core/params/registry';
import { updateTrack } from '@/core/project-ops';
import type { PatchStore } from './patch-store';
import { bindPatchToProject, createProjectStore, type ProjectStore } from './project-store';

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

export type HistoryStore = StoreApi<HistoryState> & { history: History<Project>; dispose(): void };

function describeChange(prev: Patch, next: Patch, trackId: string): { label: string; coalesceKey?: string } {
  const changed = Object.keys(diffPatchParams(prev.params, next.params)) as PatchParamId[];
  if (changed.length === 1) {
    const id = changed[0]!;
    return { label: `Change ${getParamDef(id).label}`, coalesceKey: `param:${trackId}:${id}` };
  }
  if (next.name !== prev.name) return { label: `Load “${next.name}”` };
  return { label: changed.length === 0 ? 'Rename patch' : `Change ${changed.length} settings` };
}

export interface HistoryStoreOptions {
  limit?: number;
  coalesceMs?: number;
  now?: () => number;
  /**
   * The project whose patches and notes are being edited. Without it (unit tests of the patch history
   * on its own) the store keeps a private one-track project bound to the patch store.
   */
  projectStore?: ProjectStore;
}

export function createHistoryStore(patchStore: PatchStore, opts: HistoryStoreOptions = {}): HistoryStore {
  const projectStore = opts.projectStore ?? createProjectStore();
  const unbind = opts.projectStore ? null : bindPatchToProject(patchStore, projectStore);

  let applying = false;
  const history = new History<Project>(
    {
      get: () => projectStore.getState().project,
      set: (project) => {
        applying = true; // undo/redo/execute writes must not be recorded a second time
        try {
          projectStore.setState({ project });
        } finally {
          applying = false;
        }
      },
    },
    {
      limit: opts.limit,
      coalesceMs: opts.coalesceMs,
      now: opts.now,
      // Show what was just undone or redone: select the track it happened on.
      onApply: (cmd) => {
        const s = projectStore.getState();
        if (cmd.target && cmd.target !== s.selectedTrackId && s.project.tracks.some((t) => t.id === cmd.target)) s.selectTrack(cmd.target);
      },
    },
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

  const offProject = projectStore.subscribe((state, prev) => {
    if (applying) return;
    if (state.loadGeneration !== prev.loadGeneration) {
      history.clear();
      return;
    }
    if (state.project === prev.project) return;
    const before = new Map(prev.project.tracks.map((t) => [t.id, t]));
    if (prev.project.tracks.some((t) => !state.project.tracks.some((u) => u.id === t.id))) {
      history.clear();
      return;
    }
    for (const track of state.project.tracks) {
      const old = before.get(track.id);
      if (!old || old.patch === track.patch) continue;
      const trackId = track.id;
      const oldPatch = old.patch;
      const newPatch = track.patch;
      const cmd: Command<Project> = {
        ...describeChange(oldPatch, newPatch, trackId),
        target: trackId,
        undo: (p) => updateTrack(p, trackId, { patch: oldPatch }),
        redo: (p) => updateTrack(p, trackId, { patch: newPatch }),
      };
      history.record(cmd);
    }
  });

  return Object.assign(store, {
    history,
    dispose: () => {
      offHistory();
      offProject();
      unbind?.();
    },
  });
}
