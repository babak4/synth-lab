/**
 * "Try this" experiments (plan T4.3): apply a patch diff, play a demo note, and compare before/after.
 *
 *   A = the learner's patch before "Set it up"      B = the same patch with the experiment applied
 *
 * Set up applies B. A/B swaps between them (keeping any edits made to the side being left). Undo puts
 * back exactly A. Demo notes never overlap or stick: a new one first ends the previous.
 *
 * The A and B slots are patches of ONE track. When another track is selected (`projectStore` given) the
 * experiment simply ends: A/B and Undo would otherwise load the first track's patch into the new track's
 * editor. The change itself stays undoable with the app's own undo, which is tagged with its track.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EventBus, EventMap } from '@/core/contracts/events';
import type { Patch } from '@/core/contracts/patch';
import type { TryThis } from '@/content/schema';
import type { PatchStore } from './patch-store';
import type { ProjectStore } from './project-store';

export const DEMO_NOTE_SECONDS = 1.4;

export interface TryThisState {
  /** `${entryId}#${index}` of the experiment currently set up. */
  active: string | null;
  showing: 'A' | 'B';
  setUp(entryId: string, index: number, t: TryThis): void;
  toggle(): void;
  undo(): void;
  play(): void;
}

export type TryThisStore = StoreApi<TryThisState>;

export function createTryThisStore(deps: {
  patchStore: PatchStore;
  /** When given, selecting another track ends the experiment. */
  projectStore?: ProjectStore;
  bus: EventBus<EventMap>;
  now(): number;
  /** Timer functions, injectable for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}): TryThisStore {
  const { patchStore, bus, now } = deps;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let slots: { A: Patch; B: Patch } | null = null;
  let note: number | undefined;
  let sounding: { pitch: number; timer: unknown } | null = null;

  const stopNote = () => {
    if (!sounding) return;
    clearTimer(sounding.timer);
    bus.emit('note:off', { pitch: sounding.pitch, source: 'audition', audioTime: now() });
    sounding = null;
  };
  const playNote = () => {
    stopNote();
    if (note === undefined) return;
    const pitch = note;
    bus.emit('note:on', { pitch, velocity: 100, source: 'audition', audioTime: now() });
    sounding = { pitch, timer: setTimer(() => stopNote(), DEMO_NOTE_SECONDS * 1000) };
  };

  return createStore<TryThisState>()((set, get) => {
    deps.projectStore?.subscribe((state, prev) => {
      if (state.selectedTrackId === prev.selectedTrackId || !slots) return;
      stopNote();
      slots = null;
      set({ active: null, showing: 'B' });
    });
    return {
      active: null,
      showing: 'B',

      setUp(entryId, index, t) {
        stopNote();
        const before = structuredClone(patchStore.getState().patch);
        // Setting up a second experiment starts from the learner's real patch, not the previous demo.
        const base = slots ? slots.A : before;
        const after: Patch = { ...structuredClone(base), params: { ...base.params, ...(t.patch as Partial<Patch['params']>) } };
        slots = { A: structuredClone(base), B: after };
        note = t.note;
        patchStore.getState().loadPatch(after);
        set({ active: `${entryId}#${index}`, showing: 'B' });
        playNote();
      },

      toggle() {
        if (!slots) return;
        const showing = get().showing;
        slots[showing] = structuredClone(patchStore.getState().patch); // keep edits made on the side we leave
        const next = showing === 'A' ? 'B' : 'A';
        patchStore.getState().loadPatch(slots[next]);
        set({ showing: next });
        playNote();
      },

      undo() {
        stopNote();
        if (!slots) return;
        patchStore.getState().loadPatch(slots.A);
        slots = null;
        set({ active: null, showing: 'B' });
      },

      play() {
        playNote();
      },
  };
  });
}
