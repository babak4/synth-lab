/**
 * Routes note events from the bus to an engine. The keyboard player and the on-screen keyboard only
 * emit events; this decides who plays them (the selected track's engine, once there are tracks) and
 * keeps the recorder able to listen to the very same events.
 *
 * Events from the sequencer are NOT routed: it schedules its own engines directly, sample-accurately.
 */
import type { EventBus, EventMap } from '@/core/contracts/events';
import type { SynthEngine } from '@/core/contracts/engine';

export function routeNotes(bus: EventBus<EventMap>, target: () => SynthEngine | null): () => void {
  const offs = [
    bus.on('note:on', (e) => e.source !== 'sequencer' && target()?.noteOn(e.pitch, e.velocity)),
    bus.on('note:off', (e) => e.source !== 'sequencer' && target()?.noteOff(e.pitch)),
    bus.on('sustain', (e) => e.source !== 'sequencer' && target()?.setSustain(e.down)),
    bus.on('panic', () => target()?.allNotesOff()),
  ];
  return () => offs.forEach((off) => off());
}
