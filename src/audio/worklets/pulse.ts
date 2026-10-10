/**
 * Loader for the PolyBLEP pulse worklet (plan T1.3). Registers the module once per context and
 * returns a PulseFactory for Voice.
 */
import type { OscSource, PulseFactory } from '../voice/osc-source';
import workletUrl from './pulse-osc.worklet.js?url';

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

export function loadPulseWorklet(ctx: BaseAudioContext): Promise<void> {
  let p = loaded.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(workletUrl);
    loaded.set(ctx, p);
  }
  return p;
}

function createPulse(ctx: BaseAudioContext): OscSource {
  const node = new AudioWorkletNode(ctx, 'pulse-osc', { numberOfInputs: 0, outputChannelCount: [1] });
  const frequency = node.parameters.get('frequency')!;
  const detune = node.parameters.get('detune')!;
  const pulseWidth = node.parameters.get('pulseWidth')!;
  // The worklet runs from construction; "start/stop" are modelled with a gate so the voice can
  // schedule them like an OscillatorNode. A silent ConstantSource-driven gate keeps timing exact.
  const gate = new GainNode(ctx, { gain: 0 });
  node.connect(gate);
  let ended: (() => void) | null = null;
  const stopper = new ConstantSourceNode(ctx, { offset: 0 });
  stopper.onended = () => {
    node.disconnect();
    gate.disconnect();
    ended?.();
  };
  return {
    node: gate,
    frequency,
    detune,
    pulseWidth,
    start(when) {
      gate.gain.setValueAtTime(1, when);
      stopper.start(when);
    },
    stop(when) {
      gate.gain.setValueAtTime(0, when);
      stopper.stop(when);
    },
    onEnded(cb) {
      ended = cb;
    },
  };
}

/** Ensure the worklet is registered, then hand back a factory for voices on this context. */
export async function createPulseFactory(ctx: BaseAudioContext): Promise<PulseFactory> {
  await loadPulseWorklet(ctx);
  return createPulse;
}
