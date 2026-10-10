/**
 * Delay (plan T1.6): wrapper around the stereo-delay worklet, which owns the delay lines and the
 * feedback loop (see delay.worklet.js for why this is not DelayNode + GainNode).
 *
 *   in ─► dry ───────────────────────► out
 *   in ─► [stereo-delay] ─► wetGain ─► out
 *
 * `await loadDelayWorklet(ctx)` before constructing.
 */
import delayUrl from '../worklets/delay.worklet.js?url';
import { RAMP_TC, move, safeDisconnect, type Effect } from './fx-common';

export const MAX_FEEDBACK = 0.9;
export const MAX_DELAY_S = 5;

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();
export function loadDelayWorklet(ctx: BaseAudioContext): Promise<void> {
  let p = loaded.get(ctx);
  if (!p) loaded.set(ctx, (p = ctx.audioWorklet.addModule(delayUrl)));
  return p;
}

export class Delay implements Effect {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly node: AudioWorkletNode;
  private readonly wet: GainNode;
  private readonly dry: GainNode;
  private on = false;
  private mix = 0.3;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = new GainNode(ctx);
    this.output = new GainNode(ctx);
    this.dry = new GainNode(ctx, { gain: 1 });
    this.wet = new GainNode(ctx, { gain: 0 });
    this.node = new AudioWorkletNode(ctx, 'stereo-delay', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { maxSeconds: MAX_DELAY_S },
    });
    this.input.connect(this.dry).connect(this.output);
    this.input.connect(this.node).connect(this.wet).connect(this.output);
  }

  private p(name: 'delayTime' | 'feedback' | 'pingpong' | 'send'): AudioParam {
    return this.node.parameters.get(name)!;
  }

  set(
    p: { on?: boolean; seconds?: number; feedback?: number; pingpong?: boolean; mix?: number },
    at = this.ctx.currentTime,
    immediate = false,
  ): void {
    // The processor smooths delayTime / feedback / pingpong / send itself, so plain assignment is click-free.
    if (p.seconds !== undefined) this.p('delayTime').value = Math.min(MAX_DELAY_S, Math.max(0.001, p.seconds));
    if (p.feedback !== undefined) this.p('feedback').value = Math.min(MAX_FEEDBACK, Math.max(0, p.feedback));
    if (p.pingpong !== undefined) this.p('pingpong').value = p.pingpong ? 1 : 0;
    if (p.on !== undefined) {
      this.on = p.on;
      // Closing the send lets the lines drain; the wet fade hides the cut.
      this.p('send').value = p.on ? 1 : 0;
    }
    if (p.mix !== undefined) this.mix = p.mix;
    move(this.wet.gain, this.on ? this.mix : 0, at, immediate, RAMP_TC);
  }

  dispose(): void {
    [this.input, this.output, this.dry, this.wet, this.node].forEach(safeDisconnect);
  }
}
