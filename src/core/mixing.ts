/**
 * Mixer gain resolution (plan T5.1): fader, mute and solo reduced to one linear gain per track.
 * Pure, so the rules are unit-tested here and the audio layer only applies the numbers (ramped).
 */
import { fromDb } from './db';

/** Faders at or below this are silence. */
export const SILENCE_DB = -60;

export interface ChannelState {
  id: string;
  volumeDb: number;
  mute: boolean;
  solo: boolean;
}

export const faderGain = (db: number): number => (db <= SILENCE_DB ? 0 : fromDb(db));

/**
 * While any track is soloed only soloed tracks are audible. Mute always wins, so a track that is both
 * muted and soloed stays silent (as on most DAWs).
 */
export function resolveGains(channels: readonly ChannelState[]): Map<string, number> {
  const anySolo = channels.some((c) => c.solo);
  return new Map(channels.map((c) => [c.id, c.mute || (anySolo && !c.solo) ? 0 : faderGain(c.volumeDb)]));
}
