/**
 * Voice (plan T1.2): the full per-note signal chain.
 *
 *   pitch ──► oscA ──► mixA ┐
 *        ├──► oscB ──► mixB ┤
 *        ├──► sub  ──► mixS ┼─► filter ─► ampEnv ─► tremolo ─► out
 *   noise ─────────────► mixN ┘     ▲
 *   filterEnv ─► amount(cents) ─────┤ detune
 *   cutoffMod (LFO) ────────────────┘
 *
 * Modulation entry points (`mod`) are for the LFO (T1.5). All filter modulation is in cents on
 * `detune`, so it is exponential in frequency and therefore musical.
 *
 * A voice is single-use in poly mode (trigger → release → retire) but can be re-triggered while
 * alive for mono/legato (T1.4).
 */
import type { VoiceState } from '@/core/contracts/engine';
import type { ParamId, ParamValue, PatchParamId, PatchParams } from '@/core/params/registry';
import { FILTER_ENV_CENTS } from '@/core/dsp/modulation';
import { mtof } from '../tuning';
import { Envelope, velocityScale, type EnvelopeShape } from './envelope';
import { getNoiseBuffer } from './noise';
import { OscSlot, type SlotKind } from './osc-slot';
import type { PulseFactory } from './osc-source';

export { FILTER_ENV_CENTS };
/** Filter Q is linear in the registry; lowpass/highpass biquads take it in dB. */
const dbQ = (q: number) => 20 * Math.log10(Math.max(q, 0.01));
/** Pitch glide reaches ~99% of the way in the glide time. */
const GLIDE_TAU_DIV = 4.6;

export interface VoiceOptions {
  pulse?: PulseFactory;
  /** Called once all sources have ended and nodes are disconnected. */
  onEnded?: (voice: Voice) => void;
}

export interface TriggerOptions {
  /** Seconds to glide from the previous pitch (mono/legato). 0 = jump. */
  glide?: number;
  /** Do not restart the envelopes (legato): only change pitch. */
  legato?: boolean;
}

let nextVoiceId = 1;

export class Voice {
  readonly id = nextVoiceId++;
  readonly output: AudioNode;
  readonly mod: {
    /** Add cents of vibrato. */
    pitch: AudioNode;
    /** Add cents of filter modulation. */
    cutoff: AudioNode;
    /** Tremolo: the gain param (base 1) the LFO adds to. */
    amp: AudioParam;
    /** Add pulse-width fraction. */
    pulseWidth: AudioNode;
  };

  pitch = -1;
  velocity = 0;
  held = false;
  /** Supplies the LFO cycle position for the UI; set by whoever attaches an LFO. */
  lfoPhaseSource: (time: number) => number = () => 0;

  private readonly nodes: AudioNode[] = [];
  private params: PatchParams;
  private readonly pitchCtl: ConstantSourceNode;
  private readonly filterEnvSrc: ConstantSourceNode;
  private readonly noiseSrc: AudioBufferSourceNode;
  private readonly slots: { a: OscSlot; b: OscSlot; sub: OscSlot };
  private readonly mix: { a: GainNode; b: GainNode; sub: GainNode; noise: GainNode };
  private readonly filter: BiquadFilterNode;
  private readonly ampGain: GainNode;
  private readonly tremolo: GainNode;
  private readonly filterEnvAmount: GainNode;
  private readonly ampEnv: Envelope;
  private readonly filterEnv: Envelope;
  private started = false;
  private ended = false;
  private retireAt: number | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    params: PatchParams,
    private readonly opts: VoiceOptions = {},
  ) {
    this.params = { ...params };
    const reg = <T extends AudioNode>(n: T): T => (this.nodes.push(n), n);
    const p = this.params;

    this.pitchCtl = reg(new ConstantSourceNode(ctx, { offset: 0 }));
    const pitchMod = reg(new GainNode(ctx));
    const pwMod = reg(new GainNode(ctx));
    const cutoffMod = reg(new GainNode(ctx));

    this.mix = {
      a: reg(new GainNode(ctx, { gain: p['mix-osc-a'] })),
      b: reg(new GainNode(ctx, { gain: p['mix-osc-b'] })),
      sub: reg(new GainNode(ctx, { gain: p['mix-sub'] })),
      noise: reg(new GainNode(ctx, { gain: p['mix-noise'] })),
    };

    const slotDeps = (out: AudioNode) => ({ pitch: this.pitchCtl, pitchMod, pwMod, pulse: opts.pulse, out, register: reg });
    this.slots = {
      a: new OscSlot(ctx, slotDeps(this.mix.a), p['osc-a-waveform']),
      b: new OscSlot(ctx, slotDeps(this.mix.b), p['osc-b-waveform']),
      sub: new OscSlot(ctx, slotDeps(this.mix.sub), p['sub-waveform']),
    };

    this.noiseSrc = reg(new AudioBufferSourceNode(ctx, { buffer: getNoiseBuffer(ctx), loop: true }));
    this.noiseSrc.connect(this.mix.noise);

    this.filter = reg(
      new BiquadFilterNode(ctx, { type: p['filter-type'], frequency: p['filter-cutoff'], Q: this.filterQ(p['filter-resonance'], p['filter-type']) }),
    );
    // Control-rate (once per 128-frame quantum) filter params. With audio-rate signals patched into
    // `detune` the browser would recompute biquad coefficients for every sample, which dominated the
    // per-voice cost. ~375 Hz updates are plenty for envelopes and LFOs below 20 Hz.
    for (const param of [this.filter.frequency, this.filter.detune, this.filter.Q]) param.automationRate = 'k-rate';
    for (const m of Object.values(this.mix)) m.connect(this.filter);

    this.filterEnvSrc = reg(new ConstantSourceNode(ctx, { offset: 0 }));
    this.filterEnvAmount = reg(new GainNode(ctx, { gain: p['filter-env-amount'] * FILTER_ENV_CENTS }));
    this.filterEnvSrc.connect(this.filterEnvAmount).connect(this.filter.detune);
    cutoffMod.connect(this.filter.detune);

    this.ampGain = reg(new GainNode(ctx, { gain: 0 }));
    this.tremolo = reg(new GainNode(ctx, { gain: 1 }));
    this.output = reg(new GainNode(ctx, { gain: 1 }));
    this.filter.connect(this.ampGain).connect(this.tremolo).connect(this.output);

    this.mod = { pitch: pitchMod, cutoff: cutoffMod, amp: this.tremolo.gain, pulseWidth: pwMod };

    this.ampEnv = new Envelope(this.ampGain.gain);
    this.filterEnv = new Envelope(this.filterEnvSrc.offset);

    this.applyTuning(ctx.currentTime);
    for (const k of ['osc-a-pulse-width', 'osc-b-pulse-width'] as const) this.setParam(k, p[k]);
  }

  // ── playing ─────────────────────────────────────────────────────────────────────────────

  /** Start (or re-trigger) the note at audio time `time`. */
  trigger(pitch: number, velocity: number, time: number, o: TriggerOptions = {}): void {
    if (this.ended) return;
    const hz = mtof(pitch, this.params['master-tune']);
    const first = !this.started;
    const prevHz = this.pitch >= 0 ? mtof(this.pitch, this.params['master-tune']) : hz;
    this.pitch = pitch;
    this.velocity = velocity;
    this.held = true;

    const f = this.pitchCtl.offset;
    if (first) {
      f.setValueAtTime(hz, time);
    } else if ((o.glide ?? 0) > 0) {
      f.cancelScheduledValues(time);
      f.setValueAtTime(prevHz, time);
      f.setTargetAtTime(hz, time, o.glide! / GLIDE_TAU_DIV);
    } else {
      f.cancelScheduledValues(time);
      f.setValueAtTime(hz, time);
    }
    this.filter.detune.setValueAtTime(this.keyTrackCents(pitch), time);

    if (first) this.startSources(time);
    if (o.legato && !first) return; // legato: pitch changes, envelopes keep running

    const p = this.params;
    this.ampEnv.gateOn(time, this.shape('amp'), velocityScale(velocity, p['amp-env-velocity']));
    this.filterEnv.gateOn(time, this.shape('filter'), velocityScale(velocity, p['filter-env-velocity']));
  }

  /** Release at `time`; returns the time the voice becomes inaudible. */
  release(time: number): number {
    this.held = false;
    this.ampEnv.gateOff(time);
    this.filterEnv.gateOff(time);
    return this.ampEnv.endTime ?? time;
  }

  /** Time at which the (released) voice is silent, or null while held. */
  get silentAt(): number | null {
    return this.ampEnv.endTime;
  }

  /** Stop all sources at `time` (default: when the release has died away). Nodes disconnect on end. */
  retire(time = this.silentAt ?? this.ctx.currentTime): void {
    if (this.ended || this.retireAt !== null) return;
    this.retireAt = time;
    if (!this.started) return this.teardown();
    this.pitchCtl.onended = () => this.teardown();
    this.pitchCtl.stop(time);
    this.filterEnvSrc.stop(time);
    this.noiseSrc.stop(time);
    for (const s of Object.values(this.slots)) s.stop(time);
  }

  /** Fast fade-out then retire; used when a voice is stolen (plan T1.4). */
  steal(time: number, fadeS: number): void {
    this.held = false;
    const g = this.output instanceof GainNode ? this.output.gain : null;
    g?.cancelScheduledValues(time);
    g?.setValueAtTime(1, time);
    g?.linearRampToValueAtTime(0, time + fadeS);
    this.retire(time + fadeS + 0.002);
  }

  /** Immediate teardown. */
  dispose(): void {
    if (this.ended) return;
    if (this.started && this.retireAt === null) {
      try {
        this.pitchCtl.stop(this.ctx.currentTime);
        this.filterEnvSrc.stop(this.ctx.currentTime);
        this.noiseSrc.stop(this.ctx.currentTime);
      } catch {
        /* already stopped */
      }
    }
    this.teardown();
  }

  get isEnded(): boolean {
    return this.ended;
  }

  /** Every node this voice created (empty after teardown). Exposed for leak tests. */
  get debugNodes(): readonly AudioNode[] {
    return this.nodes;
  }

  getState(time = this.ctx.currentTime): VoiceState {
    return {
      id: this.id,
      pitch: this.pitch,
      velocity: this.velocity,
      held: this.held,
      amp: this.ampEnv.stageAt(time),
      filter: this.filterEnv.stageAt(time),
      lfoPhase: this.lfoPhaseSource(time),
    };
  }

  // ── parameters ──────────────────────────────────────────────────────────────────────────

  /** Apply a patch parameter (ignores ids that are not per-voice). `time` defaults to now. */
  setParam<I extends ParamId>(id: I, value: ParamValue<I>, time = this.ctx.currentTime): void {
    const key = id as PatchParamId;
    (this.params as Record<string, unknown>)[key] = value;
    const v = value as number & string & boolean;
    const smooth = 0.01 / 3;
    switch (key) {
      case 'osc-a-waveform': return this.slots.a.setKind(v as SlotKind, time);
      case 'osc-b-waveform': return this.slots.b.setKind(v as SlotKind, time);
      case 'sub-waveform': return this.slots.sub.setKind(v as SlotKind, time);
      case 'osc-a-octave': case 'osc-a-semitone': case 'osc-a-fine':
      case 'osc-b-octave': case 'osc-b-semitone': case 'osc-b-fine':
      case 'sub-octave': return this.applyTuning(time);
      case 'osc-a-pulse-width': return this.slots.a.setPulseWidth(v, time);
      case 'osc-b-pulse-width': return this.slots.b.setPulseWidth(v, time);
      case 'mix-osc-a': return void this.mix.a.gain.setTargetAtTime(v, time, smooth);
      case 'mix-osc-b': return void this.mix.b.gain.setTargetAtTime(v, time, smooth);
      case 'mix-sub': return void this.mix.sub.gain.setTargetAtTime(v, time, smooth);
      case 'mix-noise': return void this.mix.noise.gain.setTargetAtTime(v, time, smooth);
      case 'filter-type':
        this.filter.type = v as BiquadFilterType;
        return void this.filter.Q.setValueAtTime(this.filterQ(this.params['filter-resonance'], v as BiquadFilterType), time);
      case 'filter-cutoff': return void this.filter.frequency.setTargetAtTime(v, time, smooth);
      case 'filter-resonance':
        return void this.filter.Q.setTargetAtTime(this.filterQ(v, this.params['filter-type']), time, smooth);
      case 'filter-env-amount': return void this.filterEnvAmount.gain.setTargetAtTime(v * FILTER_ENV_CENTS, time, smooth);
      case 'filter-key-tracking':
        if (this.pitch >= 0) this.filter.detune.setTargetAtTime(this.keyTrackCents(this.pitch), time, smooth);
        return;
      case 'amp-env-sustain': return this.ampEnv.setSustain(time, v);
      case 'filter-env-sustain': return this.filterEnv.setSustain(time, v);
      case 'amp-env-attack': case 'amp-env-decay': case 'amp-env-release':
        return this.ampEnv.setShape(this.shape('amp'));
      case 'filter-env-attack': case 'filter-env-decay': case 'filter-env-release':
        return this.filterEnv.setShape(this.shape('filter'));
      case 'master-tune':
        if (this.pitch >= 0) this.pitchCtl.offset.setTargetAtTime(mtof(this.pitch, v), time, smooth);
        return;
      default:
        return; // lfo-*, voicing, effects: handled elsewhere
    }
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────

  private startSources(time: number): void {
    this.started = true;
    this.pitchCtl.start(time);
    this.filterEnvSrc.start(time);
    this.noiseSrc.start(time, Math.random() * this.noiseSrc.buffer!.duration);
    for (const s of Object.values(this.slots)) s.start(time);
  }

  private shape(which: 'amp' | 'filter'): EnvelopeShape {
    const p = this.params;
    return {
      attack: p[`${which}-env-attack`],
      decay: p[`${which}-env-decay`],
      sustain: p[`${which}-env-sustain`],
      release: p[`${which}-env-release`],
    };
  }

  private filterQ(q: number, type: BiquadFilterType): number {
    return type === 'lowpass' || type === 'highpass' ? dbQ(q) : q;
  }

  private keyTrackCents(pitch: number): number {
    return this.params['filter-key-tracking'] * (pitch - 60) * 100;
  }

  private applyTuning(time: number): void {
    const p = this.params;
    const aCents = p['osc-a-octave'] * 1200 + p['osc-a-semitone'] * 100 + p['osc-a-fine'];
    const bCents = p['osc-b-octave'] * 1200 + p['osc-b-semitone'] * 100 + p['osc-b-fine'];
    this.slots.a.setDetune(aCents, time);
    this.slots.b.setDetune(bCents, time);
    this.slots.sub.setDetune(aCents + p['sub-octave'] * 1200, time); // sub follows oscillator A
  }

  private teardown(): void {
    if (this.ended) return;
    this.ended = true;
    this.held = false;
    for (const s of Object.values(this.slots)) s.dispose();
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.nodes.length = 0;
    this.opts.onEnded?.(this);
  }
}
