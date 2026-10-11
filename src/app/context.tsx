/**
 * What the UI can see of the app: stores, the engine interface and the audio host interface.
 * No Web Audio types leak through here, so UI code stays on the allowed side of the layer rule.
 */
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { AudioHost, SynthEngine } from '@/core/contracts/engine';
import type { ParamValue, PatchParamId } from '@/core/params/registry';
import type { EventBus, EventMap } from '@/core/contracts/events';
import type { AppState, AppStore } from '@/state/app-store';
import type { NotesStore } from '@/state/notes-store';
import type { PatchStore } from '@/state/patch-store';
import type { HelpStore } from '@/state/help-store';
import type { HistoryStore } from '@/state/history-store';
import type { TabStore } from '@/state/tab-store';
import type { ProjectStore } from '@/state/project-store';
import type { TransportStore } from '@/state/transport-store';
import type { ProjectFileStore } from '@/state/project-file-store';
import type { ProjectPersistence } from '@/state/persistence';
import type { PresetStore } from '@/state/preset-store';
import type { TryThisStore } from '@/state/try-this';
import type { PianoRollEditStore } from '@/state/piano-roll-edit';

export interface AppServices {
  engine: SynthEngine;
  host: AudioHost;
  patchStore: PatchStore;
  appStore: AppStore;
  presetStore: PresetStore;
  helpStore: HelpStore;
  /** Undo/redo for the patch. Every patch change is recorded automatically. */
  historyStore: HistoryStore;
  tabStore: TabStore;
  projectStore: ProjectStore;
  /** Play / stop / playhead / metronome / count-in (plan T5.2). */
  transportStore: TransportStore;
  /** New / open / save as file, and the project name. */
  projectFileStore: ProjectFileStore;
  /** Autosave to browser storage and restore on startup. */
  persistence: ProjectPersistence;
  tryThisStore: TryThisStore;
  /** Piano roll tool, snap, selection, clipboard and edit actions (plan T5.3b). */
  pianoRollEdit: PianoRollEditStore;
  /** The note/transport event bus. Everything that plays or records notes talks through this. */
  bus: EventBus<EventMap>;
  /** What is sounding right now, for highlights and the note readout. */
  notesStore: NotesStore;
  /** Must be called from a user gesture; starts the AudioContext and syncs state. */
  startAudio(): Promise<void>;
}

export const ServicesContext = createContext<AppServices | null>(null);

export function useServices(): AppServices {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('useServices must be used inside <ServicesContext.Provider>');
  return s;
}

/** Read and write one patch parameter. */
export function usePatchParam<I extends PatchParamId>(id: I): [ParamValue<I>, (v: ParamValue<I>) => void] {
  const { patchStore } = useServices();
  const value = useStore(patchStore, (s) => s.patch.params[id]) as ParamValue<I>;
  const set = useStore(patchStore, (s) => s.setParam);
  return [value, (v) => set(id, v)];
}

export function useNotes<T>(selector: (s: import('@/state/notes-store').NotesState) => T): T {
  return useStore(useServices().notesStore, selector);
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(useServices().appStore, selector);
}
