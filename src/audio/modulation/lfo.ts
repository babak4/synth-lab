/**
 * LFO unit (plan T1.5).
 *
 *   source ─► xfade ─► output ─┬─► pitchDepth  ─► voice.mod.pitch   (cents)
 *                              ├─► cutoffDepth ─► voice.mod.cutoff  (cents)
 *                              ├─► pwDepth     ─► voice.mod.pulseWidth
 *                              └─► ampSum ─► ampDepth ─► voice.mod.amp   (tremolo)
 *                          const(−1) ─► ampSum
 *
 * The graph is static. Only the depth gains change, so switching destination is a pair of short
 * gain ramps (click-free by construction) and shape changes crossfade between two sources.
 * Tremolo is gain = 1 + (depth/2)·(lfo − 1), i.e. it swings between 1 − depth and 1.
 */
import { LFO_SCALE } from '@/core/dsp/modulation';
import { createLfoSource, type LfoShape, type LfoSource, type SampleHoldFactory } from './lfo-source';

export type LfoDestination = 'pitch' | 'cutoff' | 'amp' | 'pulse-width';

export { LFO_SCALE };

export interface LfoSettings {
  shape: LfoShape;
  rateHz: number;
  depth: number;
  destination: LfoDestination;
}

/** Where an LFO connects (the voice's `mod` bundle). */
export interface ModTargets {
  pitch: AudioNode;
  cutoff: AudioNode;
  amp: AudioParam;
  pulseWidth: AudioNode;
}

const FADE_S = 0.003;
const SMOOTH_S = 0.01;

interface Slot {
  src: LfoSource;
  xfade: GainNode;
}

export class LfoUnit {
  /** Raw LFO, ±1. Exposed for visualisation and tests. */
  readonly output: GainNode;
  private readonly depths: Record<LfoDestination, GainNode>;
  private readonly ampSum: GainNode;
  private readonly dc: ConstantSourceNode;
  private current: Slot | null = null;
  private readonly fading: Slot[] = [];
  private settings: LfoSettings;
  private started = false;
  private startTime = 0;
  // Phase bookkeeping for the UI marker.
  private phase0 = 0;
  private t0 = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    settings: LfoSettings,
    private readonly sampleHold?: SampleHoldFactory,
  ) {
    this.settings = { ...settings };
    this.output = new GainNode(ctx, { gain: 1 });
    this.ampSum = new GainNode(ctx, { gain: 1 });
    this.dc = new ConstantSourceNode(ctx, { offset: -1 });
    const g = () => new GainNode(ctx, { gain: 0 });
    this.depths = { pitch: g(), cutoff: g(), amp: g(), 'pulse-width': g() };

    this.output.connect(this.depths.pitch);
    this.output.connect(this.depths.cutoff);
    this.output.connect(this.depths['pulse-width']);
    this.output.connect(this.ampSum);
    this.dc.connect(this.ampSum);
    this.ampSum.connect(this.depths.amp);

    this.current = this.build(settings.shape, false, 0);
    this.route(ctx.currentTime, true);
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────────────────

  start(when = this.ctx.currentTime): void {
    if (this.started) return;
    this.started = true;
    this.startTime = when;
    this.t0 = when;
    this.phase0 = 0;
    this.dc.start(when);
    this.current?.src.start(when);
  }

  stop(when = this.ctx.currentTime): void {
    if (!this.started) return;
    this.dc.stop(when);
    for (const s of [this.current, ...this.fading]) s?.src.stop(when);
  }

  dispose(): void {
    const safe = (fn: () => void) => {
      try {
        fn();
      } catch {
        /* already gone */
      }
    };
    if (this.started) safe(() => this.stop(this.ctx.currentTime));
    for (const s of [this.current, ...this.fading]) if (s) this.detach(s);
    for (const n of [this.output, this.ampSum, this.dc, ...Object.values(this.depths)]) safe(() => n.disconnect());
    this.current = null;
    this.fading.length = 0;
  }

  // ── settings ────────────────────────────────────────────────────────────────────────────

  setShape(shape: LfoShape, at = this.ctx.currentTime): void {
    if (shape === this.settings.shape) return;
    this.settings.shape = shape;
    this.swap(at);
  }

  setRate(hz: number, at = this.ctx.currentTime): void {
    this.phase0 = this.phaseAt(at);
    this.t0 = at;
    this.settings.rateHz = hz;
    if (this.current) {
      if (this.started) this.current.src.frequency.setTargetAtTime(hz, at, SMOOTH_S / 3);
      else this.current.src.frequency.value = hz;
    }
  }

  setDepth(depth: number, at = this.ctx.currentTime): void {
    this.settings.depth = depth;
    this.route(at);
  }

  setDestination(destination: LfoDestination, at = this.ctx.currentTime): void {
    this.settings.destination = destination;
    this.route(at);
  }

  /** Restart the cycle from phase 0 at `when` (retrigger mode). Crossfades to hide the jump. */
  restart(when: number): void {
    this.swap(when);
    this.phase0 = 0;
    this.t0 = when;
  }

  /** Cycle position 0–1 at audio time `t`, for display. */
  phaseAt(t: number): number {
    if (!this.started || t < this.t0) return this.phase0;
    const p = this.phase0 + (t - this.t0) * this.settings.rateHz;
    return p - Math.floor(p);
  }

  get currentSettings(): Readonly<LfoSettings> {
    return this.settings;
  }

  // ── routing ─────────────────────────────────────────────────────────────────────────────

  /** Connect to a voice's modulation inputs. Returns a function that disconnects. */
  connect(t: ModTargets): () => void {
    this.depths.pitch.connect(t.pitch);
    this.depths.cutoff.connect(t.cutoff);
    this.depths['pulse-width'].connect(t.pulseWidth);
    this.depths.amp.connect(t.amp);
    return () => {
      const safe = (fn: () => void) => {
        try {
          fn();
        } catch {
          /* voice already torn down */
        }
      };
      safe(() => this.depths.pitch.disconnect(t.pitch));
      safe(() => this.depths.cutoff.disconnect(t.cutoff));
      safe(() => this.depths['pulse-width'].disconnect(t.pulseWidth));
      safe(() => this.depths.amp.disconnect(t.amp));
    };
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────

  private route(at: number, immediate = false): void {
    const { depth, destination } = this.settings;
    for (const d of Object.keys(this.depths) as LfoDestination[]) {
      const target = d === destination ? depth * LFO_SCALE[d] : 0;
      const p = this.depths[d].gain;
      if (immediate) p.value = target;
      else p.setTargetAtTime(target, at, SMOOTH_S / 3);
    }
  }

  private build(shape: LfoShape, fadeIn: boolean, when: number): Slot {
    const src = createLfoSource(this.ctx, shape, this.sampleHold);
    src.frequency.value = this.settings.rateHz;
    const xfade = new GainNode(this.ctx, { gain: fadeIn ? 0 : 1 });
    src.node.connect(xfade).connect(this.output);
    if (fadeIn) {
      xfade.gain.setValueAtTime(0, when);
      xfade.gain.linearRampToValueAtTime(1, when + FADE_S);
    }
    return { src, xfade };
  }

  private swap(at: number): void {
    if (!this.started) {
      if (this.current) this.detach(this.current);
      this.current = this.build(this.settings.shape, false, at);
      return;
    }
    const when = Math.max(at, this.startTime);
    const old = this.current;
    if (old) {
      old.xfade.gain.setValueAtTime(1, when);
      old.xfade.gain.linearRampToValueAtTime(0, when + FADE_S);
      old.src.stop(when + FADE_S + 0.005);
      old.src.onEnded(() => this.detach(old));
      this.fading.push(old);
    }
    this.current = this.build(this.settings.shape, true, when);
    this.current.src.start(when);
  }

  private detach(s: Slot): void {
    try {
      s.src.node.disconnect();
      s.xfade.disconnect();
    } catch {
      /* already disconnected */
    }
    const i = this.fading.indexOf(s);
    if (i >= 0) this.fading.splice(i, 1);
  }
}
