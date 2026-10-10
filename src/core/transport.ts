/**
 * Transport maths (plan T5.2): ticks ↔ seconds, bars and beats, loop ranges, and the driver interface
 * the transport store talks to. Pure; no DOM and no Web Audio.
 *
 * Time is stored in ticks (PPQ 960). Seconds only exist when scheduling, and always come from one
 * multiplication off an anchor, never from adding up many small steps, so nothing drifts.
 */
import { PPQ, ticksPerBar, type LoopRegion, type TimeSignature } from './contracts/project';

export const SECONDS_PER_MINUTE = 60;

/** Seconds in one tick at `bpm` (a beat is a quarter note). */
export function secondsPerTick(bpm: number): number {
  return SECONDS_PER_MINUTE / (bpm * PPQ);
}

export function ticksToSeconds(ticks: number, bpm: number): number {
  return ticks * secondsPerTick(bpm);
}

/** Exact inverse of `ticksToSeconds` (fractional ticks allowed; round at the call site if needed). */
export function secondsToTicks(seconds: number, bpm: number): number {
  return seconds / secondsPerTick(bpm);
}

/** Length of the whole song in ticks. */
export function songEndTick(lengthBars: number, sig: TimeSignature): number {
  return lengthBars * ticksPerBar(sig);
}

/**
 * Ticks between metronome clicks. Simple time clicks every beat (a 3/4 or 4/4 beat is a quarter note);
 * 6/8 is compound time and clicks on the two dotted-quarter pulses.
 */
export function clickTicks(sig: TimeSignature): number {
  return sig.denominator === 8 && sig.numerator === 6 ? PPQ * 1.5 : (PPQ * 4) / sig.denominator;
}

/** Loop region in ticks, or null when looping is off. */
export function loopTicks(loop: LoopRegion, sig: TimeSignature): { start: number; end: number } | null {
  if (!loop.enabled) return null;
  const bar = ticksPerBar(sig);
  return { start: loop.startBar * bar, end: loop.endBar * bar };
}

export interface BarBeat {
  /** 1-based, as musicians count. */
  bar: number;
  beat: number;
  /** Ticks past the beat. */
  tick: number;
}

/** Playhead position as bar.beat.tick for a readout. Negative ticks clamp to the start. */
export function barBeatAt(tick: number, sig: TimeSignature): BarBeat {
  const t = Math.max(0, Math.floor(tick));
  const bar = ticksPerBar(sig);
  const pulse = clickTicks(sig);
  const inBar = t % bar;
  return { bar: Math.floor(t / bar) + 1, beat: Math.floor(inBar / pulse) + 1, tick: inBar % pulse };
}

export function formatBarBeat(tick: number, sig: TimeSignature): string {
  const p = barBeatAt(tick, sig);
  return `${p.bar}.${p.beat}`;
}

/** What a transport driver (the audio-side scheduler) must offer the transport store. */
export interface TransportDriver {
  /** Begin playing from a song tick. With `countIn`, a one-bar count-in (clicks only) comes first. */
  start(fromTick: number, countIn: boolean): void;
  /** Jump to a tick without a count-in while playing. Held notes are released. */
  seek(tick: number): void;
  /** Stop at once and silence everything the driver started. */
  stop(): void;
  /** Where the playhead is, in song ticks (fractional). Meaningful while started. */
  positionTicks(): number;
  /** The driver tells the store when the count-in finishes ('playing') or the song ends ('ended'). */
  onEvent(listener: (event: 'playing' | 'ended') => void): () => void;
}
