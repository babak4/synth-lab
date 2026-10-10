/**
 * TrackMixer (plan T5.1): one channel strip per track engine. Volume, mute and solo are resolved to one
 * linear gain per track (rules in core/mixing.ts) and applied through `engine.setTrackGain`, which
 * ramps over ~15 ms and sits before the reverb send, so a muted track also stops feeding the reverb.
 * The mixer owns the engines it is given: removing a track silences, disconnects and disposes it.
 */
import type { AudioSynthEngine, TrackMixer } from '@/core/contracts/engine';
import { resolveGains, type ChannelState } from '@/core/mixing';

interface Channel extends ChannelState {
  engine: AudioSynthEngine;
}

export class WebTrackMixer implements TrackMixer {
  private readonly channels = new Map<string, Channel>();

  /** `destination` is the master input (every track's output is summed there). */
  constructor(private readonly destination: AudioNode) {}

  get trackIds(): string[] {
    return [...this.channels.keys()];
  }

  has(trackId: string): boolean {
    return this.channels.has(trackId);
  }

  addTrack(trackId: string, source: AudioSynthEngine): void {
    if (this.channels.has(trackId)) throw new Error(`Track ${trackId} is already on the mixer`);
    source.output.connect(this.destination);
    this.channels.set(trackId, { id: trackId, engine: source, volumeDb: 0, mute: false, solo: false });
    this.apply();
  }

  removeTrack(trackId: string): void {
    const ch = this.channels.get(trackId);
    if (!ch) return;
    this.channels.delete(trackId);
    ch.engine.allNotesOff();
    try {
      ch.engine.output.disconnect(this.destination);
    } catch {
      /* already disconnected */
    }
    ch.engine.dispose();
    this.apply(); // a solo that disappears with its track must release the others
  }

  setVolumeDb(trackId: string, db: number): void {
    this.change(trackId, { volumeDb: db });
  }

  setMute(trackId: string, muted: boolean): void {
    this.change(trackId, { mute: muted });
  }

  setSolo(trackId: string, solo: boolean): void {
    this.change(trackId, { solo });
  }

  dispose(): void {
    for (const id of this.trackIds) this.removeTrack(id);
  }

  private change(trackId: string, change: Partial<ChannelState>): void {
    const ch = this.channels.get(trackId);
    if (!ch) return;
    Object.assign(ch, change);
    this.apply();
  }

  private apply(): void {
    const gains = resolveGains([...this.channels.values()]);
    for (const ch of this.channels.values()) ch.engine.setTrackGain(gains.get(ch.id) ?? 0);
  }
}
