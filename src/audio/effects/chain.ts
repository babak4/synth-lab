/**
 * Effects chain (plan T1.6): distortion → delay → reverb, fixed order (PRD §3.6).
 * Routes registry parameter ids to the right effect so the engine (T1.7) needs no per-effect code.
 */
import type { PatchParams } from '@/core/params/registry';
import { syncedSeconds, type Division } from '../modulation/rate';
import { Delay, loadDelayWorklet } from './delay';
import { Distortion } from './distortion';
import { Reverb } from './reverb';
import type { ReverbHub } from './reverb-hub';
import type { ReverbSize } from './impulse';

type FxState = Pick<
  PatchParams,
  | 'dist-on' | 'dist-drive' | 'dist-tone' | 'dist-mix'
  | 'delay-on' | 'delay-sync' | 'delay-time' | 'delay-division' | 'delay-feedback' | 'delay-pingpong' | 'delay-mix'
  | 'reverb-on' | 'reverb-size' | 'reverb-mix'
>;

export const FX_PARAM_IDS = [
  'dist-on', 'dist-drive', 'dist-tone', 'dist-mix',
  'delay-on', 'delay-sync', 'delay-time', 'delay-division', 'delay-feedback', 'delay-pingpong', 'delay-mix',
  'reverb-on', 'reverb-size', 'reverb-mix',
] as const satisfies readonly (keyof FxState)[];

export type FxParamId = (typeof FX_PARAM_IDS)[number];
export const isFxParam = (id: string): id is FxParamId => (FX_PARAM_IDS as readonly string[]).includes(id);

/** Register worklets the chain needs. Await once per context before `new EffectsChain`. */
export const loadEffectsWorklets = (ctx: BaseAudioContext): Promise<void> => loadDelayWorklet(ctx);

export class EffectsChain {
  readonly input: AudioNode;
  readonly output: AudioNode;
  readonly distortion: Distortion;
  readonly delay: Delay;
  readonly reverb: Reverb;
  /**
   * Track fader. It sits BEFORE the reverb send, so the send is post-fader: muting or turning down a
   * track also stops feeding the (possibly shared) reverb, exactly like a DAW send.
   */
  readonly trackGain: GainNode;
  private bpm = 120;
  private state: FxState;

  constructor(private readonly ctx: BaseAudioContext, initial: FxState, hub?: ReverbHub) {
    this.state = { ...initial };
    this.distortion = new Distortion(ctx);
    this.delay = new Delay(ctx);
    this.reverb = new Reverb(ctx, initial['reverb-size'] as ReverbSize, hub);
    this.trackGain = new GainNode(ctx, { gain: 1 });
    this.distortion.output.connect(this.delay.input);
    this.delay.output.connect(this.trackGain).connect(this.reverb.input);
    this.input = this.distortion.input;
    this.output = this.reverb.output;
    this.applyAll(ctx.currentTime);
  }

  setTempo(bpm: number, at = this.ctx.currentTime): void {
    this.bpm = bpm;
    if (this.state['delay-sync']) this.delay.set({ seconds: this.delaySeconds() }, at);
  }

  setParam<I extends FxParamId>(id: I, value: FxState[I], at = this.ctx.currentTime, immediate = false): void {
    this.state[id] = value;
    const s = this.state;
    switch (id) {
      case 'dist-on': case 'dist-drive': case 'dist-tone': case 'dist-mix':
        return this.distortion.set({ on: s['dist-on'], driveDb: s['dist-drive'], toneHz: s['dist-tone'], mix: s['dist-mix'] }, at, immediate);
      case 'delay-on': case 'delay-sync': case 'delay-time': case 'delay-division':
      case 'delay-feedback': case 'delay-pingpong': case 'delay-mix':
        return this.delay.set({ on: s['delay-on'], seconds: this.delaySeconds(), feedback: s['delay-feedback'], pingpong: s['delay-pingpong'], mix: s['delay-mix'] }, at, immediate);
      case 'reverb-on': case 'reverb-size': case 'reverb-mix':
        return this.reverb.set({ on: s['reverb-on'], size: s['reverb-size'] as ReverbSize, mix: s['reverb-mix'] }, at, immediate);
    }
  }

  dispose(): void {
    this.trackGain.disconnect();
    this.distortion.dispose();
    this.delay.dispose();
    this.reverb.dispose();
  }

  private delaySeconds(): number {
    const s = this.state;
    return s['delay-sync'] ? syncedSeconds(this.bpm, s['delay-division'] as Division) : s['delay-time'];
  }

  private applyAll(at: number): void {
    // Initial state is applied outright (no glide from defaults).
    for (const id of FX_PARAM_IDS) this.setParam(id, this.state[id] as never, at, true);
  }
}
