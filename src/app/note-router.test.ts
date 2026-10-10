import { describe, expect, it } from 'vitest';
import { EventBus, type EventMap } from '@/core/contracts/events';
import { MockEngine } from '@/core/mock/mock-engine';
import { routeNotes } from './note-router';

describe('routeNotes', () => {
  it('plays keyboard, on-screen and audition events on the target engine', () => {
    const bus = new EventBus<EventMap>();
    const e = new MockEngine();
    routeNotes(bus, () => e);
    bus.emit('note:on', { pitch: 60, velocity: 90, source: 'keyboard', audioTime: 0 });
    bus.emit('note:on', { pitch: 64, velocity: 90, source: 'onscreen', audioTime: 0 });
    bus.emit('note:on', { pitch: 67, velocity: 90, source: 'audition', audioTime: 0 });
    expect(e.soundingPitches).toEqual([60, 64, 67]);
    bus.emit('note:off', { pitch: 64, source: 'onscreen', audioTime: 0 });
    expect(e.soundingPitches).toEqual([60, 67]);
  });

  it('does not route the sequencer (it schedules its own engines)', () => {
    const bus = new EventBus<EventMap>();
    const e = new MockEngine();
    routeNotes(bus, () => e);
    bus.emit('note:on', { pitch: 60, velocity: 90, source: 'sequencer', audioTime: 0 });
    expect(e.calls).toEqual([]);
  });

  it('forwards sustain and panic, follows a changing target, and tolerates having none', () => {
    const bus = new EventBus<EventMap>();
    const a = new MockEngine();
    const b = new MockEngine();
    let target: MockEngine | null = a;
    const stop = routeNotes(bus, () => target);
    bus.emit('sustain', { down: true, source: 'keyboard', audioTime: 0 });
    bus.emit('note:on', { pitch: 60, velocity: 90, source: 'keyboard', audioTime: 0 });
    expect(a.calls.map((c) => c.method)).toEqual(['setSustain', 'noteOn']);
    target = b;
    bus.emit('note:on', { pitch: 62, velocity: 90, source: 'keyboard', audioTime: 0 });
    expect(b.soundingPitches).toEqual([62]);
    bus.emit('panic', { audioTime: 0 });
    expect(b.soundingPitches).toEqual([]);
    target = null;
    expect(() => bus.emit('note:on', { pitch: 1, velocity: 1, source: 'keyboard', audioTime: 0 })).not.toThrow();
    stop();
    target = a;
    bus.emit('note:on', { pitch: 70, velocity: 90, source: 'keyboard', audioTime: 0 });
    expect(a.soundingPitches).toEqual([60]);
  });
});
