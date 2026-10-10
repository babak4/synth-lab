/**
 * Composition root: the only place that wires real audio to the UI-facing services.
 * (UI code may not import audio code; this module may.)
 */
import { createSynthEngine } from '@/audio/engine';
import { WebAudioHost } from '@/audio/host';
import { bus } from '@/core/contracts/events';
import { createNotesStore } from '@/state/notes-store';
import { routeNotes } from './note-router';
import { createAppStore } from '@/state/app-store';
import { bindEngineToPatch, createPatchStore } from '@/state/patch-store';
import { createHelpStore } from '@/state/help-store';
import { createHistoryStore } from '@/state/history-store';
import { createTabStore } from '@/state/tab-store';
import { bindPatchToProject, createProjectStore } from '@/state/project-store';
import { createTransportStore } from '@/state/transport-store';
import { Sequencer } from '@/audio/sequencer';
import { WebTrackMixer } from '@/audio/track-mixer';
import { ReverbHub } from '@/audio/effects/reverb-hub';
import { SelectedEngine } from './selected-engine';
import { TrackEngines } from './track-engines';
import { createPresetStore } from '@/state/preset-store';
import { createTryThisStore } from '@/state/try-this';
import { createPianoRollEditStore } from '@/state/piano-roll-edit';
import { pianoRollView } from '@/state/piano-roll-view';
import { createIdbStorage } from '@/state/storage';
import { createProjectFileStore } from '@/state/project-file-store';
import { createProjectPersistence } from '@/state/persistence';
import { takeFrameStats } from '@/ui/visualisers/raf-loop';
import type { AppServices } from './context';

let pending: Promise<AppServices> | null = null;

/** Builds the app once, even under React StrictMode's double effects. */
export function createRuntime(): Promise<AppServices> {
  pending ??= build();
  return pending;
}

async function build(): Promise<AppServices> {
  const host = new WebAudioHost();
  const patchStore = createPatchStore();
  const projectStore = createProjectStore();
  const storage = createIdbStorage();
  // Project files (New / Open / Save as file) are judged against the project as it was at startup.
  const projectFileStore = createProjectFileStore({ projectStore });
  const persistence = createProjectPersistence({ projectStore, storage });
  // Bring back the autosaved project before the tracks are read: the track engines are built from it.
  await persistence.restore();
  persistence.start(window);
  const appStore = createAppStore();
  const presetStore = createPresetStore({ patchStore, storage });
  void presetStore.getState().init();

  // The context is created suspended; nothing is audible until startAudio() runs from a gesture.
  // The editor patch is the selected track's patch. Bound before the history store exists so loading
  // the first track is not an undo step. Undo history is per document, not per track (history-store.ts).
  bindPatchToProject(patchStore, projectStore);
  // One engine per track, all feeding the master through the mixer and sharing one reverb hub (docs/performance.md).
  const reverbHub = new ReverbHub(host.context, host.input);
  const mixer = new WebTrackMixer(host.input);
  const trackEngines = new TrackEngines(projectStore, mixer, (patch) => createSynthEngine(host.context, patch, { reverbHub }));
  await trackEngines.start();
  // What the UI and keyboard talk to: whichever track is selected.
  const engine = new SelectedEngine(() => trackEngines.selected(), () => patchStore.getState().patch);
  bindEngineToPatch(patchStore, engine);
  routeNotes(bus, () => engine);
  const { store: notesStore } = createNotesStore(bus);
  // Transport: the store holds play/stop/loop state; the Sequencer schedules notes on the audio clock.
  const transportStore = createTransportStore({ projectStore, bus });
  const sequencer = new Sequencer({
    context: host.context,
    destination: host.input,
    getProject: () => projectStore.getState().project,
    getEngine: (id) => trackEngines.get(id),
    isMetronomeOn: () => transportStore.getState().metronome,
    bus,
  });
  transportStore.getState().attachDriver(sequencer);

  host.setMasterVolumeDb(appStore.getState().masterVolumeDb);
  appStore.subscribe((s, prev) => {
    if (s.masterVolumeDb !== prev.masterVolumeDb) host.setMasterVolumeDb(s.masterVolumeDb);
    if (s.audio === 'off' && prev.audio !== 'off') transportStore.getState().stop(); // the clock is suspended
  });

  const helpStore = createHelpStore();
  const historyStore = createHistoryStore(patchStore, { projectStore });
  const tabStore = createTabStore();
  const pianoRollEdit = createPianoRollEditStore({ projectStore, historyStore, transportStore, view: pianoRollView });
  const tryThisStore = createTryThisStore({ patchStore, bus, now: () => host.currentTime });
  const startAudio = async () => {
    if (appStore.getState().audio === 'on') return;
    appStore.getState().setAudio('starting');
    await host.start();
    appStore.getState().setAudio('on');
  };

  const services: AppServices = { engine, host, patchStore, appStore, presetStore, bus, notesStore, helpStore, historyStore, tabStore, projectStore, transportStore, projectFileStore, persistence, tryThisStore, pianoRollEdit, startAudio };
  // Test hook (like the old synth-html `window.__daw`): e2e tests assert on state, not pixels.
  (window as unknown as { __synth: unknown }).__synth = { ...services, trackEngines, mixer, sequencer, vizStats: takeFrameStats };
  return services;
}
