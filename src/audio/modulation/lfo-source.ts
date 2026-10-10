/** LFO signal sources: native oscillators for the periodic shapes, a worklet for sample-and-hold. */
import sampleHoldUrl from '../worklets/sh-lfo.worklet.js?url';

export type LfoShape = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'sample-hold';

export interface LfoSource {
  readonly node: AudioNode;
  readonly frequency: AudioParam;
  start(when: number): void;
  stop(when: number): void;
  onEnded(cb: () => void): void;
}

export type SampleHoldFactory = (ctx: BaseAudioContext) => LfoSource;

/**
 * Chromium peak-normalises its built-in band-limited sawtooth/square (ramp only reaches ±0.81, plateau
 * ±0.85, with Gibbs spikes at the edges), so "100% depth" would deliver ~15–19% less than asked and
 * every edge would carry a spike. LFOs are slow, so we do not need band-limiting: those two shapes
 * play an exact one-cycle table instead. Sine and triangle are exact natively.
 */
const TABLE = 4096;
const tables = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

function table(ctx: BaseAudioContext, shape: 'sawtooth' | 'square'): AudioBuffer {
  let byShape = tables.get(ctx);
  if (!byShape) tables.set(ctx, (byShape = new Map()));
  let buf = byShape.get(shape);
  if (!buf) {
    buf = new AudioBuffer({ length: TABLE, sampleRate: ctx.sampleRate });
    const d = buf.getChannelData(0);
    for (let i = 0; i < TABLE; i++) {
      const phase = i / TABLE;
      // Same phase convention as OscillatorNode: starts at 0 (saw) / +1 (square), first half positive.
      d[i] = shape === 'sawtooth' ? (phase < 0.5 ? 2 * phase : 2 * phase - 2) : phase < 0.5 ? 1 : -1;
    }
    byShape.set(shape, buf);
  }
  return buf;
}

function createTableSource(ctx: BaseAudioContext, shape: 'sawtooth' | 'square'): LfoSource {
  const src = new AudioBufferSourceNode(ctx, { buffer: table(ctx, shape), loop: true, playbackRate: 0 });
  // Hz in → playbackRate out: one table cycle per TABLE samples at rate 1.
  const hz = new ConstantSourceNode(ctx, { offset: 4 });
  const toRate = new GainNode(ctx, { gain: TABLE / ctx.sampleRate });
  hz.connect(toRate).connect(src.playbackRate);
  src.onended = () => {
    hz.disconnect();
    toRate.disconnect();
  };
  return {
    node: src,
    frequency: hz.offset,
    start(when) {
      src.start(when);
      hz.start(when);
    },
    stop(when) {
      src.stop(when);
      hz.stop(when);
    },
    onEnded: (cb) => {
      const prev = src.onended;
      src.onended = (e) => {
        prev?.call(src, e);
        cb();
      };
    },
  };
}

export function createLfoSource(ctx: BaseAudioContext, shape: LfoShape, sampleHold?: SampleHoldFactory): LfoSource {
  if (shape === 'sample-hold') {
    // Without the worklet, fall back to a square so the LFO still moves.
    return sampleHold ? sampleHold(ctx) : createTableSource(ctx, 'square');
  }
  if (shape === 'sawtooth' || shape === 'square') return createTableSource(ctx, shape);
  const osc = new OscillatorNode(ctx, { type: shape, frequency: 4 });
  return {
    node: osc,
    frequency: osc.frequency,
    start: (t) => osc.start(t),
    stop: (t) => osc.stop(t),
    onEnded: (cb) => {
      osc.onended = cb;
    },
  };
}

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

export async function createSampleHoldFactory(ctx: BaseAudioContext): Promise<SampleHoldFactory> {
  let p = loaded.get(ctx);
  if (!p) loaded.set(ctx, (p = ctx.audioWorklet.addModule(sampleHoldUrl)));
  await p;
  return (c) => {
    const node = new AudioWorkletNode(c, 'sample-hold-lfo', { numberOfInputs: 0, outputChannelCount: [1] });
    const gate = new GainNode(c, { gain: 0 });
    node.connect(gate);
    const stopper = new ConstantSourceNode(c, { offset: 0 });
    let ended: (() => void) | null = null;
    stopper.onended = () => {
      node.disconnect();
      gate.disconnect();
      ended?.();
    };
    return {
      node: gate,
      frequency: node.parameters.get('frequency')!,
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
  };
}
