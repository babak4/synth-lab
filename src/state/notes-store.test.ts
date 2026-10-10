import { describe, expect, it } from 'vitest';
import { EventBus, type EventMap } from '@/core/contracts/events';
import { createNotesStore } from './notes-store';

const on = (pitch: number) => ({ pitch, velocity: 100, source: 'keyboard' as const, audioTime: 0 });
const off = (pitch: number) => ({ pitch, source: 'keyboard' as const, audioTime: 0 });

describe('notes store', () => {
  it('tracks held notes and the most recent one', () => {
    const bus = new EventBus<EventMap>();
    const { store } = createNotesStore(bus);
    bus.emit('note:on', on(60));
    bus.emit('note:on', on(64));
    expect([...store.getState().held.keys()].sort()).toEqual([60, 64]);
    expect(store.getState().last).toBe(64);
    bus.emit('note:off', off(64));
    expect([...store.getState().held.keys()]).toEqual([60]);
    expect(store.getState().last).toBe(64); // readout stays
  });

  it('counts the same pitch from two sources, and only clears it when both let go', () => {
    const bus = new EventBus<EventMap>();
    const { store } = createNotesStore(bus);
    bus.emit('note:on', on(60));
    bus.emit('note:on', { ...on(60), source: 'onscreen' });
    bus.emit('note:off', off(60));
    expect(store.getState().held.has(60)).toBe(true);
    bus.emit('note:off', off(60));
    expect(store.getState().held.has(60)).toBe(false);
  });

  it('ignores a stray note-off and a panic clears everything', () => {
    const bus = new EventBus<EventMap>();
    const { store } = createNotesStore(bus);
    bus.emit('note:off', off(61));
    expect(store.getState().held.size).toBe(0);
    bus.emit('note:on', on(60));
    bus.emit('sustain', { down: true, source: 'keyboard', audioTime: 0 });
    expect(store.getState().sustain).toBe(true);
    bus.emit('panic', { audioTime: 0 });
    expect(store.getState().held.size).toBe(0);
    expect(store.getState().sustain).toBe(false);
  });

  it('stops listening after dispose', () => {
    const bus = new EventBus<EventMap>();
    const { store, dispose } = createNotesStore(bus);
    dispose();
    bus.emit('note:on', on(60));
    expect(store.getState().held.size).toBe(0);
  });
});
