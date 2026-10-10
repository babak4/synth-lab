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
import { createPresetStore } from '@/state/preset-store';
import { createTryThisStore } from '@/state/try-this';
import { createIdbStorage } from '@/state/storage';
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
  const appStore = createAppStore();
  const presetStore = createPresetStore({ patchStore, storage: createIdbStorage() });
  void presetStore.getState().init();

  // The context is created suspended; nothing is audible until startAudio() runs from a gesture.
  const engine = await createSynthEngine(host.context, patchStore.getState().patch);
  engine.output.connect(host.input);
  bindEngineToPatch(patchStore, engine);
  routeNotes(bus, () => engine);
  const { store: notesStore } = createNotesStore(bus);

  host.setMasterVolumeDb(appStore.getState().masterVolumeDb);
  appStore.subscribe((s, prev) => {
    if (s.masterVolumeDb !== prev.masterVolumeDb) host.setMasterVolumeDb(s.masterVolumeDb);
    if (s.tempo !== prev.tempo) engine.setTempo(s.tempo);
  });
  engine.setTempo(appStore.getState().tempo);

  const helpStore = createHelpStore();
  const tryThisStore = createTryThisStore({ patchStore, bus, now: () => host.currentTime });
  const startAudio = async () => {
    if (appStore.getState().audio === 'on') return;
    appStore.getState().setAudio('starting');
    await host.start();
    appStore.getState().setAudio('on');
  };

  const services: AppServices = { engine, host, patchStore, appStore, presetStore, bus, notesStore, helpStore, tryThisStore, startAudio };
  // Test hook (like the old synth-html `window.__daw`): e2e tests assert on state, not pixels.
  (window as unknown as { __synth: unknown }).__synth = { ...services, vizStats: takeFrameStats };
  return services;
}
