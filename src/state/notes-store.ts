/**
 * Which notes are sounding right now, for display (key highlights, the note-name readout). Driven only
 * by the event bus, so it works the same for the laptop keyboard, the mouse and (later) the sequencer.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EventBus, EventMap } from '@/core/contracts/events';

export interface NotesState {
  /** Pitches currently down, with a count per pitch (two sources can hold the same note). */
  held: ReadonlyMap<number, number>;
  /** Most recently struck pitch (stays after release, so the readout does not blink out). */
  last: number | null;
  sustain: boolean;
}

export type NotesStore = StoreApi<NotesState>;

export function createNotesStore(bus: EventBus<EventMap>): { store: NotesStore; dispose(): void } {
  const store = createStore<NotesState>()(() => ({ held: new Map(), last: null, sustain: false }));
  const offs = [
    bus.on('note:on', (e) =>
      store.setState((s) => {
        const held = new Map(s.held);
        held.set(e.pitch, (held.get(e.pitch) ?? 0) + 1);
        return { held, last: e.pitch };
      }),
    ),
    bus.on('note:off', (e) =>
      store.setState((s) => {
        const n = (s.held.get(e.pitch) ?? 0) - 1;
        if (n < 0) return s;
        const held = new Map(s.held);
        if (n === 0) held.delete(e.pitch);
        else held.set(e.pitch, n);
        return { held };
      }),
    ),
    bus.on('sustain', (e) => store.setState({ sustain: e.down })),
    bus.on('panic', () => store.setState({ held: new Map(), sustain: false })),
  ];
  return { store, dispose: () => offs.forEach((off) => off()) };
}
