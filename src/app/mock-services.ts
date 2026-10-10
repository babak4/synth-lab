/** Services backed by MockEngine / MockAudioHost, for UI tests and Storybook-style demos. */
import { EventBus, type EventMap } from '@/core/contracts/events';
import { MockAudioHost, MockEngine } from '@/core/mock/mock-engine';
import { createNotesStore } from '@/state/notes-store';
import { routeNotes } from './note-router';
import { createAppStore } from '@/state/app-store';
import { bindEngineToPatch, createPatchStore } from '@/state/patch-store';
import { createHelpStore } from '@/state/help-store';
import { createPresetStore } from '@/state/preset-store';
import { createTryThisStore } from '@/state/try-this';
import { createMemoryStorage } from '@/state/storage';
import type { AppServices } from './context';

export function createMockServices(): AppServices & { engine: MockEngine; host: MockAudioHost } {
  const engine = new MockEngine();
  const host = new MockAudioHost();
  const patchStore = createPatchStore();
  const appStore = createAppStore();
  const bus = new EventBus<EventMap>(); // a private bus per test: no cross-test leakage
  const presetStore = createPresetStore({ patchStore, storage: createMemoryStorage() });
  void presetStore.getState().init();
  bindEngineToPatch(patchStore, engine);
  routeNotes(bus, () => engine);
  const { store: notesStore } = createNotesStore(bus);
  appStore.subscribe((s, prev) => {
    if (s.masterVolumeDb !== prev.masterVolumeDb) host.setMasterVolumeDb(s.masterVolumeDb);
    if (s.tempo !== prev.tempo) engine.setTempo(s.tempo);
  });
  const helpStore = createHelpStore();
  const tryThisStore = createTryThisStore({ patchStore, bus, now: () => host.currentTime });
  const startAudio = async () => {
    appStore.getState().setAudio('starting');
    await host.start();
    appStore.getState().setAudio('on');
  };
  return { engine, host, patchStore, appStore, presetStore, bus, notesStore, helpStore, tryThisStore, startAudio };
}
