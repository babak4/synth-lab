/**
 * ADSR envelope as an analytic model that also drives an AudioParam (plan T1.2).
 *
 * Every automation event we emit is mirrored by a segment in the model, so `valueAt(t)` knows the
 * exact value the AudioParam will have. That gives us:
 *  - early release / retrigger that "hold at the current value" WITHOUT cancelAndHoldAtTime
 *    (missing in Firefox/Safari): cancel future events, re-add the partial ramp, pin the value;
 *  - stage + progress for the UI's envelope dots, without reading back from the audio thread.
 *
 * Shapes: attack is linear; decay and release are exponential (setTargetAtTime) with the time
 * constant chosen so the stage covers 60 dB of its distance in the stated time (RT60 convention).
 */
import type { EnvPosition, EnvStage } from '@/core/contracts/engine';

/** The slice of AudioParam we use; lets tests substitute a recorder. */
export interface ParamSink {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface EnvelopeShape {
  /** Seconds. */
  attack: number;
  decay: number;
  release: number;
  /** Sustain as a fraction (0–1) of the peak level. */
  sustain: number;
}

/** 60 dB expressed as an amplitude ratio. */
export const LN_1000 = Math.log(1000);
/** The voice is considered silent (−90 dB) after this multiple of the release time. */
export const RELEASE_TAIL = 1.5;
/** Attack never shorter than this, to keep retriggers click-free. */
export const MIN_RAMP = 0.0005;

type Seg =
  | { kind: 'linear'; stage: EnvStage; t0: number; v0: number; t1: number; v1: number }
  | { kind: 'target'; stage: EnvStage; t0: number; v0: number; target: number; tau: number };

export class Envelope {
  private segs: Seg[] = [];
  private shape: EnvelopeShape = { attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.3 };
  private peak = 1;
  private gateOnTime = -Infinity;
  private gateOffTime: number | null = null;

  constructor(private readonly sink: ParamSink) {}

  // ── queries ─────────────────────────────────────────────────────────────────────────────

  valueAt(t: number): number {
    const s = this.segAt(t);
    if (!s) return 0;
    if (s.kind === 'linear') {
      if (t >= s.t1) return s.v1;
      return s.v0 + ((s.v1 - s.v0) * (t - s.t0)) / (s.t1 - s.t0);
    }
    return s.target + (s.v0 - s.target) * Math.exp(-(t - s.t0) / s.tau);
  }

  stageAt(t: number): EnvPosition {
    const level = this.valueAt(t);
    const s = this.segAt(t);
    if (!s) return { stage: 'release', elapsed: 0, level };
    if (s.stage === 'decay') {
      const elapsed = t - s.t0;
      return elapsed >= this.shape.decay
        ? { stage: 'sustain', elapsed: elapsed - this.shape.decay, level }
        : { stage: 'decay', elapsed, level };
    }
    return { stage: s.stage, elapsed: t - s.t0, level };
  }

  get isGateOn(): boolean {
    return this.gateOffTime === null && this.segs.length > 0;
  }

  /** Time at which the release has decayed to inaudibility, or null while the gate is on. */
  get endTime(): number | null {
    return this.gateOffTime === null ? null : this.gateOffTime + this.shape.release * RELEASE_TAIL;
  }

  // ── commands ────────────────────────────────────────────────────────────────────────────

  /** Start (or restart) the envelope at `t`, from wherever it currently is. `peak` is velocity-scaled. */
  gateOn(t: number, shape: EnvelopeShape, peak: number): void {
    const v0 = this.hold(t);
    this.shape = { ...shape };
    this.peak = Math.max(peak, 1e-6);
    this.gateOnTime = t;
    this.gateOffTime = null;

    const attack =
      v0 >= this.peak ? 0 : Math.max(MIN_RAMP, shape.attack * ((this.peak - v0) / this.peak));
    const tA = t + attack;
    this.sink.linearRampToValueAtTime(this.peak, tA);
    this.segs.push({ kind: 'linear', stage: 'attack', t0: t, v0, t1: tA, v1: this.peak });
    this.pushDecay(tA, this.peak);
  }

  gateOff(t: number): void {
    if (this.gateOffTime !== null || this.segs.length === 0) return;
    const at = Math.max(t, this.gateOnTime);
    const v0 = this.hold(at);
    const tau = this.shape.release / LN_1000;
    this.sink.setTargetAtTime(0, at, tau);
    this.segs.push({ kind: 'target', stage: 'release', t0: at, v0, target: 0, tau });
    this.gateOffTime = at;
  }

  /** Live sustain change while held: glides to the new level over the decay time. */
  setSustain(t: number, sustain: number): void {
    this.shape = { ...this.shape, sustain };
    if (!this.isGateOn) return;
    const first = this.segs[this.segs.length - 1]!;
    if (first.kind === 'linear' && t < first.t1) {
      // Still in attack: just re-plan the decay that follows it.
      this.sink.cancelScheduledValues(first.t1);
      this.pushDecay(first.t1, this.peak);
      return;
    }
    const v = this.hold(t);
    this.pushDecay(t, v);
  }

  /** Update the shape used for the NEXT gateOn only (times); sustain is handled by setSustain. */
  setShape(shape: Partial<EnvelopeShape>): void {
    this.shape = { ...this.shape, ...shape };
  }

  /** Immediately silence (used when a voice is torn down). */
  forceZero(t: number): void {
    this.hold(t);
    this.segs.push({ kind: 'linear', stage: 'release', t0: t, v0: 0, t1: t, v1: 0 });
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────

  private pushDecay(t0: number, v0: number): void {
    const tau = Math.max(this.shape.decay, MIN_RAMP) / LN_1000;
    const target = this.shape.sustain * this.peak;
    // The decay segment replaces any previous decay segment that started at or after t0.
    this.segs = this.segs.filter((s) => !(s.stage === 'decay' && s.t0 >= t0));
    this.sink.setTargetAtTime(target, t0, tau);
    this.segs.push({ kind: 'target', stage: 'decay', t0, v0, target, tau });
  }

  private segAt(t: number): Seg | undefined {
    for (let i = this.segs.length - 1; i >= 0; i--) if (this.segs[i]!.t0 <= t) return this.segs[i];
    return undefined;
  }

  /**
   * Pin the parameter at its current modelled value from `t` onwards, discarding anything scheduled
   * later. Returns that value. If `t` falls inside a ramp, the partial ramp is re-added because
   * cancelScheduledValues removes the ramp's end event.
   */
  private hold(t: number): number {
    const v = this.valueAt(t);
    this.sink.cancelScheduledValues(t);
    this.segs = this.segs.filter((s) => s.t0 < t);
    const last = this.segs[this.segs.length - 1];
    if (last?.kind === 'linear' && last.t1 > t) {
      this.sink.linearRampToValueAtTime(v, t);
      last.t1 = t;
      last.v1 = v;
    }
    this.sink.setValueAtTime(v, t);
    return v;
  }
}

export { velocityScale } from '@/core/dsp/modulation';
