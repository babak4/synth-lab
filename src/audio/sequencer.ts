/**
 * Sequencer (plan T5.2): the audio-side lookahead scheduler. A Worker timer ticks every 25 ms; each
 * tick asks the pure `SequencerPlan` for the events up to 100 ms ahead of `AudioContext.currentTime`
 * and hands them to the track engines with sample-accurate times (`engine.noteOn(pitch, vel, time)`),
 * and schedules metronome clicks. Nothing here depends on how late or jittery the timer is, as long as
 * it ticks inside the lookahead window.
 *
 * Mute and solo are not handled here: they are gains in the mixer (core/mixing.ts).
 * Bus events with source 'sequencer' are for display only (key highlights); they are emitted when the
 * note is heard, not when it is scheduled, and the engines never receive them from the bus.
 */
import type { SynthEngine } from '@/core/contracts/engine';
import type { EventBus, EventMap } from '@/core/contracts/events';
import { ticksPerBar } from '@/core/contracts/project';
import { SequencerPlan, type PlanEvent, type PlanProject } from '@/core/sequencer-plan';
import type { TransportDriver } from '@/core/transport';
import { scheduleClick } from './metronome';
import { WorkerTimer, type TickTimer } from './timer';

/** Seconds of notes handed to the engines ahead of the audio clock. */
export const LOOKAHEAD_S = 0.1;
/** Gap between pressing play and the first event, so the first notes are scheduled before they are due. */
export const START_LEAD_S = 0.05;

export interface SequencerDeps {
  context: BaseAudioContext;
  /** Where metronome clicks go (the master input). */
  destination: AudioNode;
  getProject(): PlanProject;
  getEngine(trackId: string): SynthEngine | undefined;
  isMetronomeOn(): boolean;
  bus?: EventBus<EventMap>;
  timer?: TickTimer;
}

interface Display {
  time: number;
  on: boolean;
  trackId: string;
  pitch: number;
  velocity: number;
}

export class Sequencer implements TransportDriver {
  private plan: SequencerPlan | null = null;
  private readonly timer: TickTimer;
  private readonly listeners = new Set<(e: 'playing' | 'ended') => void>();
  /** Tracks that were sent sequencer notes, so stop silences exactly those. */
  private readonly touched = new Set<string>();
  private pending: Display[] = [];
  /** Display note-ons already emitted without their note-off, so stop can close them. */
  private readonly shown = new Map<string, Display>();
  private inCountIn = false;
  private fromTick = 0;

  constructor(private readonly deps: SequencerDeps) {
    this.timer = deps.timer ?? new WorkerTimer();
  }

  get playing(): boolean {
    return this.plan !== null;
  }

  // ── TransportDriver ─────────────────────────────────────────────────────────────────────

  start(fromTick: number, countIn: boolean): void {
    this.stop();
    this.begin(fromTick, countIn);
  }

  seek(tick: number): void {
    if (!this.plan) return;
    this.silence();
    this.begin(tick, false);
  }

  stop(): void {
    this.timer.stop();
    if (!this.plan) return;
    this.plan = null;
    this.silence();
  }

  /** Where the playhead is, in song ticks, as heard (the output latency is taken off the audio clock). */
  positionTicks(): number {
    return this.plan ? this.plan.positionAt(this.heardTime()).tick : this.fromTick;
  }

  onEvent(listener: (e: 'playing' | 'ended') => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.stop();
    this.timer.dispose();
    this.listeners.clear();
  }

  // ── scheduling ──────────────────────────────────────────────────────────────────────────

  /**
   * One scheduler pass: hand over everything due before `now + LOOKAHEAD_S`. The timer calls this every
   * 25 ms; tests call it directly (an OfflineAudioContext suspended at the times they choose).
   */
  tick(): void {
    const plan = this.plan;
    if (!plan) return;
    this.pump(plan);
    const heard = this.heardTime();
    this.flushDisplay(heard);
    const pos = plan.positionAt(heard);
    if (this.inCountIn && !pos.countIn) {
      this.inCountIn = false;
      this.emit('playing');
    }
    if (plan.ended && heard >= plan.endTime) {
      // The plan already released every note at the song end; nothing is left to silence.
      this.timer.stop();
      this.plan = null;
      this.flushDisplay(Infinity);
      this.touched.clear();
      this.fromTick = 0;
      this.emit('ended');
    }
  }

  private begin(fromTick: number, countIn: boolean): void {
    const project = this.deps.getProject();
    const now = this.deps.context.currentTime;
    this.fromTick = fromTick;
    this.inCountIn = countIn;
    this.plan = new SequencerPlan({
      fromTick,
      startTime: now + START_LEAD_S,
      countInTicks: countIn ? ticksPerBar(project.timeSignature) : 0,
      tempo: project.tempo,
    });
    this.pump(this.plan);
    this.timer.start(() => this.tick());
  }

  private pump(plan: SequencerPlan): void {
    const now = this.deps.context.currentTime;
    const events = plan.advance(now + LOOKAHEAD_S, now, this.deps.getProject(), this.deps.isMetronomeOn());
    for (const e of events) this.dispatch(e);
  }

  private dispatch(e: PlanEvent): void {
    const { context, destination } = this.deps;
    if (e.kind === 'click') {
      scheduleClick(context, destination, e.time, e.accent);
      return;
    }
    const engine = this.deps.getEngine(e.trackId);
    if (e.kind === 'noteOn') {
      this.touched.add(e.trackId);
      engine?.noteOn(e.pitch, e.velocity, e.time);
      this.pending.push({ time: e.time, on: true, trackId: e.trackId, pitch: e.pitch, velocity: e.velocity });
    } else {
      engine?.noteOff(e.pitch, e.time);
      this.pending.push({ time: e.time, on: false, trackId: e.trackId, pitch: e.pitch, velocity: 0 });
    }
  }

  /** Silence what the sequencer started (not live keyboard notes on other tracks) and close the display. */
  private silence(): void {
    for (const id of this.touched) this.deps.getEngine(id)?.allNotesOff();
    this.touched.clear();
    this.pending = [];
    for (const d of this.shown.values()) this.show({ ...d, on: false });
    this.shown.clear();
  }

  private heardTime(): number {
    const latency = (this.deps.context as Partial<AudioContext>).outputLatency;
    return Math.max(0, this.deps.context.currentTime - (typeof latency === 'number' && latency < 0.5 ? latency : 0));
  }

  private flushDisplay(until: number): void {
    let i = 0;
    while (i < this.pending.length && this.pending[i]!.time <= until) {
      const d = this.pending[i++]!;
      const key = `${d.trackId}:${d.pitch}`;
      if (d.on) {
        if (this.shown.has(key)) this.show({ ...this.shown.get(key)!, on: false }); // retrigger: close the old one
        this.shown.set(key, d);
        this.show(d);
      } else if (this.shown.delete(key)) {
        this.show(d);
      }
    }
    this.pending = this.pending.slice(i);
  }

  private show(d: Display): void {
    const bus = this.deps.bus;
    if (!bus) return;
    if (d.on) bus.emit('note:on', { pitch: d.pitch, velocity: d.velocity, source: 'sequencer', audioTime: d.time, trackId: d.trackId });
    else bus.emit('note:off', { pitch: d.pitch, source: 'sequencer', audioTime: d.time, trackId: d.trackId });
  }

  private emit(e: 'playing' | 'ended'): void {
    for (const l of [...this.listeners]) l(e);
  }
}
