/**
 * One oscillator position in a voice (A, B or sub). Owns the crossfade that makes waveform changes
 * click-free: a new oscillator fades in while the old one fades out, then the old one is stopped.
 */
import { createOsc, type OscKind, type OscSource, type PulseFactory } from './osc-source';

export type SlotKind = OscKind | 'off';

/** Crossfade length for waveform swaps. */
export const XFADE_S = 0.01;

interface Instance {
  src: OscSource;
  xfade: GainNode;
  stopped: boolean;
}

export interface SlotDeps {
  /** Feeds every oscillator's frequency input (Hz). */
  pitch: AudioNode;
  /** Cents of modulation (LFO → pitch). */
  pitchMod: AudioNode;
  /** Pulse-width modulation (fraction). */
  pwMod: AudioNode;
  pulse?: PulseFactory;
  /** Where the slot's audio goes (its mixer gain). */
  out: AudioNode;
  register: <T extends AudioNode>(node: T) => T;
}

export class OscSlot {
  private current: Instance | null = null;
  private fading: Instance[] = [];
  private started = false;
  private startTime = 0;
  private detuneCents = 0;
  private pulseWidth = 0.5;
  kind: SlotKind;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly deps: SlotDeps,
    kind: SlotKind,
  ) {
    this.kind = kind;
    if (kind !== 'off') this.current = this.build(kind, false, 0);
  }

  start(when: number): void {
    if (this.started) return;
    this.started = true;
    this.startTime = when;
    this.current?.src.start(when);
  }

  setKind(kind: SlotKind, at = this.ctx.currentTime): void {
    if (kind === this.kind) return;
    const old = this.current;
    this.kind = kind;
    if (!this.started) {
      // Not sounding yet: swap silently.
      if (old) this.discard(old, false);
      this.current = kind === 'off' ? null : this.build(kind, false, at);
      return;
    }
    const when = Math.max(at, this.startTime);
    if (old) this.fadeOut(old, when);
    this.current = kind === 'off' ? null : this.build(kind, true, when);
    this.current?.src.start(when);
  }

  setDetune(cents: number, at = this.ctx.currentTime, smoothS = 0.01): void {
    this.detuneCents = cents;
    const p = this.current?.src.detune;
    if (!p) return;
    // Before the voice sounds, set the value outright so a note never starts with a pitch chirp.
    if (this.started) p.setTargetAtTime(cents, at, smoothS / 3);
    else p.value = cents;
  }

  setPulseWidth(width: number, at = this.ctx.currentTime, smoothS = 0.01): void {
    this.pulseWidth = width;
    const p = this.current?.src.pulseWidth;
    if (!p) return;
    if (this.started) p.setTargetAtTime(width, at, smoothS / 3);
    else p.value = width;
  }

  /** Stop all oscillators at `when` (they self-disconnect when ended). */
  stop(when: number): void {
    for (const inst of [this.current, ...this.fading]) {
      if (!inst || inst.stopped) continue;
      inst.stopped = true;
      if (this.started) inst.src.stop(when);
    }
  }

  /** Immediate teardown (no ramp). */
  dispose(): void {
    for (const inst of [this.current, ...this.fading]) if (inst) this.discard(inst, this.started && !inst.stopped);
    this.current = null;
    this.fading = [];
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────

  private build(kind: OscKind, fadeIn: boolean, when: number): Instance {
    const { deps } = this;
    const src = createOsc(this.ctx, kind, deps.pulse);
    deps.register(src.node);
    const xfade = deps.register(new GainNode(this.ctx, { gain: fadeIn ? 0 : 1 }));
    src.frequency.value = 0;
    src.detune.value = this.detuneCents;
    deps.pitch.connect(src.frequency);
    deps.pitchMod.connect(src.detune);
    if (src.pulseWidth) {
      src.pulseWidth.value = this.pulseWidth;
      deps.pwMod.connect(src.pulseWidth);
    }
    src.node.connect(xfade).connect(deps.out);
    if (fadeIn) {
      xfade.gain.setValueAtTime(0, when);
      xfade.gain.linearRampToValueAtTime(1, when + XFADE_S);
    }
    return { src, xfade, stopped: false };
  }

  private fadeOut(inst: Instance, when: number): void {
    inst.xfade.gain.setValueAtTime(1, when);
    inst.xfade.gain.linearRampToValueAtTime(0, when + XFADE_S);
    inst.stopped = true;
    inst.src.stop(when + XFADE_S + 0.005);
    inst.src.onEnded(() => this.teardown(inst));
    this.fading.push(inst);
  }

  private teardown(inst: Instance): void {
    this.detach(inst);
    this.fading = this.fading.filter((f) => f !== inst);
  }

  private discard(inst: Instance, stop: boolean): void {
    if (stop) {
      try {
        inst.src.stop(this.ctx.currentTime);
      } catch {
        /* already stopped */
      }
    }
    this.detach(inst);
  }

  private detach(inst: Instance): void {
    const safe = (fn: () => void) => {
      try {
        fn();
      } catch {
        /* already disconnected */
      }
    };
    safe(() => this.deps.pitch.disconnect(inst.src.frequency));
    safe(() => this.deps.pitchMod.disconnect(inst.src.detune));
    if (inst.src.pulseWidth) safe(() => this.deps.pwMod.disconnect(inst.src.pulseWidth!));
    safe(() => inst.src.node.disconnect());
    safe(() => inst.xfade.disconnect());
  }
}
