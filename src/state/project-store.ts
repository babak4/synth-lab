/**
 * Project store (plan T5.1): the document being edited. Tracks, tempo, signature, length, loop and
 * which track is selected. The synth panel keeps editing the patch store; `bindPatchToProject` makes
 * that patch the selected track's.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  createProject,
  type LoopRegion,
  type Project,
  type TimeSignature,
  type Track,
} from '@/core/contracts/project';
import type { Patch } from '@/core/contracts/patch';
import * as ops from '@/core/project-ops';
import type { PatchStore } from './patch-store';

export const TEMPO_MIN = 40;
export const TEMPO_MAX = 240;
export const MAX_LENGTH_BARS = 64;

export interface ProjectState {
  project: Project;
  selectedTrackId: string;
  setTempo(bpm: number): void;
  setTimeSignature(sig: TimeSignature): void;
  setLengthBars(bars: number): void;
  setLoop(loop: Partial<LoopRegion>): void;
  selectTrack(id: string): void;
  addTrack(): void;
  duplicateTrack(id: string): void;
  removeTrack(id: string): void;
  moveTrack(id: string, toIndex: number): void;
  setTrackPatch(id: string, patch: Patch): void;
  setTrackVolume(id: string, db: number): void;
  setTrackMute(id: string, mute: boolean): void;
  setTrackSolo(id: string, solo: boolean): void;
  renameTrack(id: string, name: string): void;
  /** Replace the whole document (open / new project). */
  loadProject(project: Project): void;
}

export type ProjectStore = StoreApi<ProjectState>;

export const selectedTrack = (s: Pick<ProjectState, 'project' | 'selectedTrackId'>): Track =>
  s.project.tracks.find((t) => t.id === s.selectedTrackId) ?? s.project.tracks[0]!;

export function createProjectStore(initial: Project = createProject()): ProjectStore {
  return createStore<ProjectState>()((set, get) => {
    /** Apply a pure op; ignore it when the op refused (returned the same object). */
    const apply = (next: Project, selectedTrackId = get().selectedTrackId) => {
      if (next === get().project) return;
      set({ project: next, selectedTrackId: next.tracks.some((t) => t.id === selectedTrackId) ? selectedTrackId : next.tracks[0]!.id });
    };
    return {
      project: initial,
      selectedTrackId: initial.tracks[0]!.id,
      setTempo: (bpm) => {
        const tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(bpm) || TEMPO_MIN));
        if (tempo !== get().project.tempo) apply({ ...get().project, tempo });
      },
      setTimeSignature: (timeSignature) => apply({ ...get().project, timeSignature }),
      setLengthBars: (bars) => {
        const p = get().project;
        const lengthBars = Math.min(MAX_LENGTH_BARS, Math.max(1, Math.round(bars)));
        if (lengthBars === p.lengthBars) return;
        // Keep the loop inside the song: shrink it, or grow it along when it covered the whole song.
        const wasWhole = p.loop.startBar === 0 && p.loop.endBar === p.lengthBars;
        const endBar = wasWhole ? lengthBars : Math.min(p.loop.endBar, lengthBars);
        const startBar = Math.min(p.loop.startBar, endBar - 1);
        apply({ ...p, lengthBars, loop: { ...p.loop, startBar, endBar } });
      },
      setLoop: (change) => {
        const p = get().project;
        const merged = { ...p.loop, ...change };
        const endBar = Math.min(p.lengthBars, Math.max(1, Math.round(merged.endBar)));
        const startBar = Math.min(endBar - 1, Math.max(0, Math.round(merged.startBar)));
        apply({ ...p, loop: { enabled: merged.enabled, startBar, endBar } });
      },
      selectTrack: (id) => {
        if (id !== get().selectedTrackId && get().project.tracks.some((t) => t.id === id)) set({ selectedTrackId: id });
      },
      addTrack: () => {
        const next = ops.addTrack(get().project);
        apply(next, next.tracks.at(-1)!.id);
      },
      duplicateTrack: (id) => {
        const before = get().project;
        const next = ops.duplicateTrack(before, id);
        const copy = next.tracks.find((t) => !before.tracks.some((b) => b.id === t.id));
        apply(next, copy?.id);
      },
      removeTrack: (id) => {
        const before = get().project;
        const i = before.tracks.findIndex((t) => t.id === id);
        const next = ops.removeTrack(before, id);
        // If the selected track goes, select its neighbour (the one that takes its place, else the previous).
        apply(next, id === get().selectedTrackId ? (next.tracks[Math.min(i, next.tracks.length - 1)]?.id ?? '') : undefined);
      },
      moveTrack: (id, to) => apply(ops.moveTrack(get().project, id, to)),
      setTrackPatch: (id, patch) => apply(ops.updateTrack(get().project, id, { patch })),
      setTrackVolume: (id, volumeDb) => apply(ops.updateTrack(get().project, id, { volumeDb: Math.min(6, Math.max(-60, volumeDb)) })),
      setTrackMute: (id, mute) => apply(ops.updateTrack(get().project, id, { mute })),
      setTrackSolo: (id, solo) => apply(ops.updateTrack(get().project, id, { solo })),
      renameTrack: (id, name) => {
        const trimmed = name.trim().slice(0, 40);
        if (trimmed) apply(ops.updateTrack(get().project, id, { name: trimmed }));
      },
      loadProject: (project) => set({ project, selectedTrackId: project.tracks[0]!.id }),
    };
  });
}

/**
 * "Edit sound": the patch store is the selected track's patch. Edits flow into the project; selecting
 * another track loads that track's patch into the editor. Returns an unsubscribe function.
 *
 * `onTrackSwitch` runs after a different track's patch has been loaded (the runtime clears undo
 * history there, since a patch change recorded for one track must not be replayed onto another).
 */
export function bindPatchToProject(patchStore: PatchStore, projectStore: ProjectStore, onTrackSwitch?: () => void): () => void {
  let syncing = false;
  // Share the track's patch object (patches are only ever replaced, never mutated), so "is the editor
  // showing this track's patch?" is a reference check.
  const loadSelected = () => {
    syncing = true;
    try {
      patchStore.setState({ patch: selectedTrack(projectStore.getState()).patch });
    } finally {
      syncing = false;
    }
  };
  loadSelected();
  const offPatch = patchStore.subscribe((state, prev) => {
    if (syncing || state.patch === prev.patch) return;
    projectStore.getState().setTrackPatch(projectStore.getState().selectedTrackId, state.patch);
  });
  const offProject = projectStore.subscribe((state, prev) => {
    const differs = selectedTrack(state).patch !== patchStore.getState().patch;
    if (differs) loadSelected();
    if (differs || state.selectedTrackId !== prev.selectedTrackId) onTrackSwitch?.();
  });
  return () => {
    offPatch();
    offProject();
  };
}
