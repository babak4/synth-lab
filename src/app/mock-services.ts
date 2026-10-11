/** Services backed by MockEngine / MockAudioHost, for UI tests and Storybook-style demos. */
import { EventBus, type EventMap } from '@/core/contracts/events';
import { MockAudioHost, MockEngine } from '@/core/mock/mock-engine';
import { createNotesStore } from '@/state/notes-store';
import { routeNotes } from './note-router';
import { createAppStore } from '@/state/app-store';
import { bindEngineToPatch, createPatchStore } from '@/state/patch-store';
import { createHelpStore } from '@/state/help-store';
import { createHistoryStore } from '@/state/history-store';
import { createTabStore } from '@/state/tab-store';
import { bindPatchToProject, createProjectStore } from '@/state/project-store';
import { createTransportStore } from '@/state/transport-store';
import { createPresetStore } from '@/state/preset-store';
import { createTryThisStore } from '@/state/try-this';
import { createPianoRollEditStore } from '@/state/piano-roll-edit';
import { pianoRollView } from '@/state/piano-roll-view';
import { createMemoryStorage } from '@/state/storage';
import { createProjectFileStore } from '@/state/project-file-store';
import { createProjectPersistence } from '@/state/persistence';
import type { AppServices } from './context';

export function createMockServices(): AppServices & { engine: MockEngine; host: MockAudioHost } {
  const engine = new MockEngine();
  const host = new MockAudioHost();
  const patchStore = createPatchStore();
  const projectStore = createProjectStore();
  const projectFileStore = createProjectFileStore({ projectStore });
  const storage = createMemoryStorage();
  const persistence = createProjectPersistence({ projectStore, storage }); // not started: tests opt in
  const appStore = createAppStore();
  const bus = new EventBus<EventMap>(); // a private bus per test: no cross-test leakage
  const presetStore = createPresetStore({ patchStore, storage });
  void presetStore.getState().init();
  // Bound before the history store exists so loading the first track's patch is not an undo step.
  bindPatchToProject(patchStore, projectStore);
  bindEngineToPatch(patchStore, engine);
  routeNotes(bus, () => engine);
  const { store: notesStore } = createNotesStore(bus);
  appStore.subscribe((s, prev) => {
    if (s.masterVolumeDb !== prev.masterVolumeDb) host.setMasterVolumeDb(s.masterVolumeDb);
  });
  projectStore.subscribe((s, prev) => {
    if (s.project.tempo !== prev.project.tempo) engine.setTempo(s.project.tempo);
  });
  const transportStore = createTransportStore({ projectStore, bus });
  const helpStore = createHelpStore();
  const historyStore = createHistoryStore(patchStore, { projectStore });
  const tabStore = createTabStore();
  const pianoRollEdit = createPianoRollEditStore({ projectStore, historyStore, transportStore, view: pianoRollView });
  const tryThisStore = createTryThisStore({ patchStore, projectStore, bus, now: () => host.currentTime });
  const startAudio = async () => {
    appStore.getState().setAudio('starting');
    await host.start();
    appStore.getState().setAudio('on');
  };
  return { engine, host, patchStore, appStore, presetStore, bus, notesStore, helpStore, historyStore, tabStore, projectStore, transportStore, projectFileStore, persistence, tryThisStore, pianoRollEdit, startAudio };
}
