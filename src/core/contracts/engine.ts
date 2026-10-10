/**
 * Engine contracts (plan T0.2, LOCKED).
 *
 * `SynthEngine` is the ONLY surface the UI and sequencer use to make sound.
 * It deliberately exposes no Web Audio nodes; `AudioSynthEngine` (audio layer only) adds the output node.
 */
import type { Patch } from './patch';
import type { ParamValue, PatchParamId } from '../params/registry';

export type EnvStage = 'attack' | 'decay' | 'sustain' | 'release';

export interface EnvPosition {
  stage: EnvStage;
  /** Seconds since this stage began. */
  elapsed: number;
  /** Current envelope output, 0–1. */
  level: number;
}

export interface VoiceState {
  /** Stable for the life of the voice. */
  id: number;
  pitch: number;
  velocity: number;
  /** False once the key is released (voice may still be sounding in release). */
  held: boolean;
  amp: EnvPosition;
  filter: EnvPosition;
  /** 0–1 position in the LFO cycle (voice-local when LFO retrigger is on, else the shared LFO). */
  lfoPhase: number;
}

/** Structural subset of `AnalyserNode`, so UI code can read audio data without Web Audio imports. */
export interface AnalyserLike {
  readonly fftSize: number;
  readonly frequencyBinCount: number;
  readonly minDecibels: number;
  readonly maxDecibels: number;
  getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void;
  getFloatFrequencyData(array: Float32Array<ArrayBuffer>): void;
}

export interface SynthEngine {
  /** `time` is on the audio clock (seconds); omitted means "now". */
  noteOn(pitch: number, velocity: number, time?: number): void;
  noteOff(pitch: number, time?: number): void;
  /** Sustain pedal: while down, released notes keep sounding until it is lifted. */
  setSustain(down: boolean, time?: number): void;
  allNotesOff(): void;

  setParam<I extends PatchParamId>(id: I, value: ParamValue<I>, time?: number): void;
  getPatch(): Patch;
  /** Diffs against the current patch and applies only what changed. Never leaves stuck notes. */
  loadPatch(patch: Patch): void;
  /** Project tempo, for tempo-synced LFO and delay. */
  setTempo(bpm: number): void;

  getAnalyser(): AnalyserLike;
  getVoiceStates(): readonly VoiceState[];
  /** 0–1 phase of the LFO for display. */
  getLfoPhase(): number;
  dispose(): void;
}

/** Audio-layer view of an engine; the sequencer-side mixer needs the output node. */
export interface AudioSynthEngine extends SynthEngine {
  readonly output: AudioNode;
  /**
   * Channel-strip level (linear gain, ramped ~15 ms). Applied BEFORE the reverb send, so mute / solo /
   * volume also control what a track feeds the shared reverb. Set by the TrackMixer.
   */
  setTrackGain(gain: number, time?: number): void;
}

export type AudioHostState = 'uninitialised' | 'suspended' | 'running' | 'closed';

export interface MeterReading {
  /** Linear 0–1+ peak since the last read. */
  peak: number;
  /** Linear RMS of the latest block. */
  rms: number;
  /** True once any sample reached full scale; latches until `resetClip()`. */
  clipped: boolean;
}

/** Owns the AudioContext and the master chain (master gain → limiter → analyser → destination). */
export interface AudioHost {
  readonly state: AudioHostState;
  /** Audio clock in seconds (0 before start). */
  readonly currentTime: number;
  /** Hz; needed to label spectrum axes (an AnalyserNode does not expose it). 48000 until started. */
  readonly sampleRate: number;
  /** Must be called from a user gesture. Nothing is audible before this. */
  start(): Promise<void>;
  /** Suspend audio (the top-bar "audio off"). `start()` resumes. */
  stop(): Promise<void>;
  setMasterVolumeDb(db: number): void;
  getMeter(): MeterReading;
  resetClip(): void;
  getAnalyser(): AnalyserLike;
  onStateChange(listener: (state: AudioHostState) => void): () => void;
}

export interface TrackMixer {
  addTrack(trackId: string, source: AudioSynthEngine): void;
  removeTrack(trackId: string): void;
  setVolumeDb(trackId: string, db: number): void;
  setMute(trackId: string, muted: boolean): void;
  setSolo(trackId: string, solo: boolean): void;
  dispose(): void;
}

/** Fade and ramp constants shared across the audio layer. */
export const SMOOTHING = {
  /** Mute/solo/bypass ramps (PRD §7.4 asks for 5–20 ms). */
  rampMs: 15,
  /** Fade applied to a stolen voice (plan T1.4). */
  stealFadeMs: 5,
} as const;
