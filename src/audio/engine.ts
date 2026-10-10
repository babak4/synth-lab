/**
 * SynthEngine implementation (plan T1.7): one instance per track.
 *
 *   voices ─► voiceBus ─► EffectsChain ─► output (to TrackMixer / master)
 *   LFO (free-running, shared)  ─► every voice's mod inputs
 *   LFO (per voice, retrigger)  ─► that voice only
 *
 * Every patch parameter has a route (compile-time exhaustive over the registry), so adding a
 * parameter without binding it is a type error.
 */
import type { AnalyserLike, AudioSynthEngine, VoiceState } from '@/core/contracts/engine';
import { createPatch, diffPatchParams, type Patch } from '@/core/contracts/patch';
import type { ParamValue, PatchParamId, PatchParams } from '@/core/params/registry';
import { EffectsChain, isFxParam, loadEffectsWorklets, type FxParamId } from './effects/chain';
import type { ReverbHub } from './effects/reverb-hub';
import { LfoUnit, type LfoSettings } from './modulation/lfo';
import { createSampleHoldFactory, type SampleHoldFactory } from './modulation/lfo-source';
import { effectiveRateHz, type Division } from './modulation/rate';
import { VoiceAllocator, type AllocVoice } from './voice/allocator';
import type { PulseFactory } from './voice/osc-source';
import { Voice } from './voice/voice';
import { createPulseFactory } from './worklets/pulse';

/**
 * Pre-effects trim. At the default −12 dB master volume even eight full-level sawtooth voices stay
 * below clipping (8 × 0.68 × 0.6 × 0.25 ≈ 0.8), so the default is both safe and not too quiet.
 */
export const VOICE_BUS_GAIN = 0.6;

type Route = 'voice' | 'voicing' | 'lfo' | 'fx';

/** Exhaustive over the registry: a missing key is a compile error. */
const ROUTES: Record<PatchParamId, Route> = {
  'osc-a-waveform': 'voice', 'osc-a-octave': 'voice', 'osc-a-semitone': 'voice', 'osc-a-fine': 'voice', 'osc-a-pulse-width': 'voice',
  'osc-b-waveform': 'voice', 'osc-b-octave': 'voice', 'osc-b-semitone': 'voice', 'osc-b-fine': 'voice', 'osc-b-pulse-width': 'voice',
  'sub-waveform': 'voice', 'sub-octave': 'voice',
  'mix-osc-a': 'voice', 'mix-osc-b': 'voice', 'mix-sub': 'voice', 'mix-noise': 'voice',
  'filter-type': 'voice', 'filter-cutoff': 'voice', 'filter-resonance': 'voice', 'filter-env-amount': 'voice', 'filter-key-tracking': 'voice',
  'amp-env-attack': 'voice', 'amp-env-decay': 'voice', 'amp-env-sustain': 'voice', 'amp-env-release': 'voice', 'amp-env-velocity': 'voice',
  'filter-env-attack': 'voice', 'filter-env-decay': 'voice', 'filter-env-sustain': 'voice', 'filter-env-release': 'voice', 'filter-env-velocity': 'voice',
  'lfo-shape': 'lfo', 'lfo-sync': 'lfo', 'lfo-rate': 'lfo', 'lfo-division': 'lfo', 'lfo-depth': 'lfo', 'lfo-destination': 'lfo', 'lfo-retrigger': 'lfo',
  'voice-mode': 'voicing', 'voice-count': 'voicing', 'voice-glide': 'voicing', 'master-tune': 'voice',
  'dist-on': 'fx', 'dist-drive': 'fx', 'dist-tone': 'fx', 'dist-mix': 'fx',
  'delay-on': 'fx', 'delay-sync': 'fx', 'delay-time': 'fx', 'delay-division': 'fx', 'delay-feedback': 'fx', 'delay-pingpong': 'fx', 'delay-mix': 'fx',
  'reverb-on': 'fx', 'reverb-size': 'fx', 'reverb-mix': 'fx',
};

/** Exposed so a test can assert the table covers the registry at runtime too. */
export const PARAM_ROUTES: Readonly<Record<PatchParamId, Route>> = ROUTES;

/** Adapts a Voice (+ its optional per-voice LFO) to what the allocator drives. */
class EngineVoice implements AllocVoice {
  private lfoStarted = false;
  private detach: (() => void) | null = null;

  constructor(
    readonly voice: Voice,
    private readonly lfo: LfoUnit | null,
    shared: LfoUnit,
  ) {
    const unit = lfo ?? shared;
    this.detach = unit.connect(voice.mod);
    voice.lfoPhaseSource = (t) => unit.phaseAt(t);
  }

  get isEnded() { return this.voice.isEnded; }
  get silentAt() { return this.voice.silentAt; }
  get ownLfo() { return this.lfo; }

  trigger(pitch: number, velocity: number, time: number, o?: { glide?: number; legato?: boolean }) {
    if (this.lfo) {
      if (!this.lfoStarted) {
        this.lfo.start(time);
        this.lfoStarted = true;
      } else if (!o?.legato) {
        this.lfo.restart(time); // retrigger: the LFO cycle begins with the note
      }
    }
    this.voice.trigger(pitch, velocity, time, o);
  }
  release(time: number) { return this.voice.release(time); }
  retire(time?: number) { this.voice.retire(time); }
  steal(time: number, fadeS: number) { this.voice.steal(time, fadeS); }

  dispose() {
    this.detach?.();
    this.detach = null;
    this.lfo?.dispose();
  }
}

export interface EngineOptions {
  /** Housekeeping interval in ms; 0 disables the timer (offline rendering and tests call `tick`). */
  janitorMs?: number;
  pulse?: PulseFactory;
  sampleHold?: SampleHoldFactory;
  /**
   * Shared reverb convolvers. Give every track in a project the same hub: it sounds identical to a
   * convolver per track and costs a fraction of the CPU. Omitted = a private hub (standalone engine).
   */
  reverbHub?: ReverbHub;
}

export class SynthEngineImpl implements AudioSynthEngine {
  readonly output: GainNode;
  private readonly bus: GainNode;
  private readonly effects: EffectsChain;
  private readonly lfo: LfoUnit;
  private readonly allocator: VoiceAllocator<EngineVoice>;
  private analyser: AnalyserNode | null = null;
  private patch: Patch;
  private bpm = 120;
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(private readonly ctx: BaseAudioContext, patch: Patch, private readonly opts: EngineOptions = {}) {
    this.patch = structuredClone(patch);
    const p = this.patch.params;

    this.bus = new GainNode(ctx, { gain: VOICE_BUS_GAIN });
    this.effects = new EffectsChain(ctx, p, opts.reverbHub);
    this.output = new GainNode(ctx, { gain: 1 });
    this.bus.connect(this.effects.input);
    this.effects.output.connect(this.output);

    this.lfo = new LfoUnit(ctx, this.lfoSettings(), opts.sampleHold);
    this.lfo.start(ctx.currentTime);

    this.allocator = new VoiceAllocator<EngineVoice>((time) => this.makeVoice(time));
    this.allocator.setMode(p['voice-mode'], ctx.currentTime);
    this.allocator.setMaxVoices(p['voice-count'], ctx.currentTime);
    this.allocator.setGlide(p['voice-glide']);

    const ms = opts.janitorMs ?? (typeof AudioContext !== 'undefined' && ctx instanceof AudioContext ? 50 : 0);
    if (ms > 0) this.timer = setInterval(() => this.tick(ctx.currentTime), ms);
  }

  // ── SynthEngine ─────────────────────────────────────────────────────────────────────────

  noteOn(pitch: number, velocity: number, time?: number): void {
    if (this.disposed) return;
    const v = Math.min(127, Math.max(1, Math.round(velocity)));
    this.allocator.noteOn(pitch, v, this.at(time));
  }

  noteOff(pitch: number, time?: number): void {
    if (this.disposed) return;
    this.allocator.noteOff(pitch, this.at(time));
  }

  setSustain(down: boolean, time?: number): void {
    if (this.disposed) return;
    this.allocator.setSustain(down, this.at(time));
  }

  allNotesOff(): void {
    this.allocator.allNotesOff(this.ctx.currentTime);
  }

  setParam<I extends PatchParamId>(id: I, value: ParamValue<I>, time?: number): void {
    if (this.disposed) return;
    const t = this.at(time);
    (this.patch.params as Record<string, unknown>)[id] = value;
    this.route(id, value, t);
  }

  getPatch(): Patch {
    return structuredClone(this.patch);
  }

  loadPatch(next: Patch): void {
    if (this.disposed) return;
    const changed = diffPatchParams(this.patch.params, next.params);
    this.patch.name = next.name;
    const t = this.ctx.currentTime;
    // Voicing mode first: a mode change panics held notes, which must happen before new values land.
    const order = Object.keys(changed) as PatchParamId[];
    order.sort((a, b) => Number(ROUTES[b] === 'voicing') - Number(ROUTES[a] === 'voicing'));
    for (const id of order) {
      (this.patch.params as Record<string, unknown>)[id] = changed[id];
      this.route(id, changed[id] as never, t);
    }
  }

  setTrackGain(gain: number, time?: number): void {
    if (this.disposed) return;
    const t = this.at(time);
    this.effects.trackGain.gain.setTargetAtTime(Math.max(0, gain), t, 0.015 / 3);
  }

  setTempo(bpm: number): void {
    this.bpm = bpm;
    this.effects.setTempo(bpm, this.ctx.currentTime);
    this.applyLfo(this.ctx.currentTime);
  }

  getAnalyser(): AnalyserLike {
    if (!this.analyser) {
      this.analyser = new AnalyserNode(this.ctx, { fftSize: 2048, smoothingTimeConstant: 0.6 });
      this.output.connect(this.analyser);
    }
    return this.analyser;
  }

  getVoiceStates(): readonly VoiceState[] {
    const now = this.ctx.currentTime;
    return this.allocator.voices.map((v) => v.voice.getState(now));
  }

  getLfoPhase(): number {
    const own = this.allocator.voices.at(-1)?.ownLfo;
    return (own ?? this.lfo).phaseAt(this.ctx.currentTime);
  }

  dispose(): void {
    if (this.disposed) return;
    this.allocator.allNotesOff(this.ctx.currentTime);
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lfo.dispose();
    this.effects.dispose();
    for (const n of [this.bus, this.output, this.analyser]) {
      try {
        n?.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }

  // ── housekeeping ────────────────────────────────────────────────────────────────────────

  /** Retire idle mono voices and drop ended ones. Called by the janitor timer, or by tests. */
  tick(now: number): void {
    this.allocator.tick(now);
  }

  /** Number of live voices (for tests and the CPU meter). */
  get voiceCount(): number {
    return this.allocator.voices.length;
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────

  private at(time: number | undefined): number {
    return Math.max(time ?? 0, this.ctx.currentTime);
  }

  private lfoSettings(): LfoSettings {
    const p = this.patch.params;
    return {
      shape: p['lfo-shape'],
      rateHz: this.lfoRate(),
      depth: p['lfo-depth'],
      destination: p['lfo-destination'],
    };
  }

  private lfoRate(): number {
    const p = this.patch.params;
    return effectiveRateHz({ sync: p['lfo-sync'], rateHz: p['lfo-rate'], division: p['lfo-division'] as Division, bpm: this.bpm });
  }

  private makeVoice(time: number): EngineVoice {
    const own = this.patch.params['lfo-retrigger'] ? new LfoUnit(this.ctx, this.lfoSettings(), this.opts.sampleHold) : null;
    let ev: EngineVoice | null = null;
    const voice = new Voice(this.ctx, this.patch.params, {
      pulse: this.opts.pulse,
      onEnded: () => ev?.dispose(),
    });
    voice.output.connect(this.bus);
    ev = new EngineVoice(voice, own, this.lfo);
    void time;
    return ev;
  }

  private allVoices(): EngineVoice[] {
    return [...this.allocator.voices];
  }

  private applyLfo(t: number): void {
    const s = this.lfoSettings();
    for (const unit of [this.lfo, ...this.allVoices().map((v) => v.ownLfo)]) {
      if (!unit) continue;
      unit.setShape(s.shape, t);
      unit.setRate(s.rateHz, t);
      unit.setDepth(s.depth, t);
      unit.setDestination(s.destination, t);
    }
  }

  private route<I extends PatchParamId>(id: I, value: ParamValue<I>, t: number): void {
    switch (ROUTES[id]) {
      case 'voice':
        for (const ev of this.allVoices()) ev.voice.setParam(id, value, t);
        return;
      case 'voicing':
        if (id === 'voice-mode') this.allocator.setMode(value as 'poly' | 'mono' | 'legato', t);
        else if (id === 'voice-count') this.allocator.setMaxVoices(value as number, t);
        else if (id === 'voice-glide') this.allocator.setGlide(value as number);
        return;
      case 'lfo':
        // lfo-retrigger only affects voices created from now on.
        if (id !== 'lfo-retrigger') this.applyLfo(t);
        return;
      case 'fx':
        if (isFxParam(id)) this.effects.setParam(id as FxParamId, value as never, t);
        return;
    }
  }
}

/** Load every worklet the engine needs, then build it. */
export async function createSynthEngine(ctx: BaseAudioContext, patch: Patch = createPatch(), opts: EngineOptions = {}): Promise<SynthEngineImpl> {
  const [pulse, sampleHold] = await Promise.all([createPulseFactory(ctx), createSampleHoldFactory(ctx), loadEffectsWorklets(ctx)]);
  return new SynthEngineImpl(ctx, patch, { pulse, sampleHold, ...opts });
}

export type { PatchParams };
