/**
 * Distortion (plan T1.6): drive → tanh soft clipper (4× oversampled) → tone low-pass, crossfaded
 * against the dry signal. Bypassed = dry only, bit-transparent.
 */
import { fromDb } from '../analysis';
import { RAMP_TC, move, safeDisconnect, type Effect } from './fx-common';

/** Gain compensation after clipping so drive does not simply get louder. */
const POST_GAIN = 0.7;
/** Curve steepness. Input is clamped to ±1 by the shaper, so a hot signal ends in a soft hard-limit. */
const CURVE_K = 3;

export function tanhCurve(samples = 2049, k = CURVE_K): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples);
  const norm = Math.tanh(k);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

export class Distortion implements Effect {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly pre: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly shaper: WaveShaperNode;
  private on = false;
  private mix = 0.5;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = new GainNode(ctx);
    this.output = new GainNode(ctx);
    this.dry = new GainNode(ctx, { gain: 1 });
    this.wet = new GainNode(ctx, { gain: 0 });
    // Drive is applied before the shaper; 0.5 leaves headroom for a ±2 voice sum.
    this.pre = new GainNode(ctx, { gain: 0.5 * fromDb(12) });
    this.shaper = new WaveShaperNode(ctx, { curve: tanhCurve(), oversample: '4x' });
    const post = new GainNode(ctx, { gain: POST_GAIN });
    this.tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 8000, Q: -3.0103 }); // Q in dB: Butterworth
    this.input.connect(this.dry).connect(this.output);
    this.input.connect(this.pre).connect(this.shaper).connect(post).connect(this.tone).connect(this.wet).connect(this.output);
    this.nodes = [this.input, this.output, this.dry, this.wet, this.pre, this.shaper, post, this.tone];
  }
  private readonly nodes: AudioNode[];

  set(p: { on?: boolean; driveDb?: number; toneHz?: number; mix?: number }, at = this.ctx.currentTime, immediate = false): void {
    if (p.driveDb !== undefined) move(this.pre.gain, 0.5 * fromDb(p.driveDb), at, immediate, 0.01 / 3);
    if (p.toneHz !== undefined) move(this.tone.frequency, p.toneHz, at, immediate, 0.01 / 3);
    if (p.on !== undefined) this.on = p.on;
    if (p.mix !== undefined) this.mix = p.mix;
    move(this.wet.gain, this.on ? this.mix : 0, at, immediate, RAMP_TC);
    move(this.dry.gain, this.on ? 1 - this.mix : 1, at, immediate, RAMP_TC);
  }

  dispose(): void {
    this.nodes.forEach(safeDisconnect);
  }
}
