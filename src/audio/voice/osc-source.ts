/**
 * Oscillator source abstraction. Basic shapes use OscillatorNode; the PolyBLEP pulse (T1.3) is an
 * AudioWorkletNode behind the same interface, so the voice does not care which it gets.
 *
 * Convention: `frequency` is driven entirely by an input connection (intrinsic value 0), so one
 * shared pitch control node can feed every oscillator in a voice and survive waveform swaps.
 */
export type OscKind = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'pulse';

export interface OscSource {
  readonly node: AudioNode;
  readonly frequency: AudioParam;
  readonly detune: AudioParam;
  /** Present only on pulse sources. */
  readonly pulseWidth?: AudioParam;
  start(when: number): void;
  stop(when: number): void;
  onEnded(cb: () => void): void;
}

/** Creates a pulse oscillator; supplied by the pulse worklet loader (T1.3). */
export type PulseFactory = (ctx: BaseAudioContext) => OscSource;

export function createBasicOsc(ctx: BaseAudioContext, type: OscillatorType): OscSource {
  const osc = new OscillatorNode(ctx, { type, frequency: 0 });
  return {
    node: osc,
    frequency: osc.frequency,
    detune: osc.detune,
    start: (when) => osc.start(when),
    stop: (when) => osc.stop(when),
    onEnded: (cb) => {
      osc.onended = cb;
    },
  };
}

export function createOsc(ctx: BaseAudioContext, kind: OscKind, pulse?: PulseFactory): OscSource {
  if (kind === 'pulse') return pulse ? pulse(ctx) : createBasicOsc(ctx, 'square'); // square = 50% pulse
  return createBasicOsc(ctx, kind);
}
