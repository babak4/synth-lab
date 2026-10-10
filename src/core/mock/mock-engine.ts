/**
 * MockEngine / MockAudioHost (plan T0.2): implement the engine contracts with no audio.
 * UI and state lanes build against these until the real engine lands; swapping needs no UI change.
 */
import { createPatch, type Patch } from '../contracts/patch';
import type {
  AnalyserLike,
  AudioHost,
  AudioHostState,
  EnvPosition,
  MeterReading,
  SynthEngine,
  VoiceState,
} from '../contracts/engine';
import type { ParamValue, PatchParamId } from '../params/registry';

export type MockCall = { method: string; args: unknown[] };

export class SilentAnalyser implements AnalyserLike {
  fftSize = 2048;
  frequencyBinCount = 1024;
  minDecibels = -100;
  maxDecibels = -30;
  getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void {
    array.fill(0);
  }
  getFloatFrequencyData(array: Float32Array<ArrayBuffer>): void {
    array.fill(-Infinity);
  }
}

const IDLE_ENV: EnvPosition = { stage: 'sustain', elapsed: 0, level: 0 };

export class MockEngine implements SynthEngine {
  /** Every call, in order — assert on this in tests. */
  readonly calls: MockCall[] = [];
  private patch: Patch;
  private voices = new Map<number, VoiceState>();
  private sustained = new Set<number>();
  private sustain = false;
  private nextVoiceId = 1;
  tempo = 120;
  disposed = false;

  constructor(patch: Patch = createPatch()) {
    this.patch = structuredClone(patch);
  }

  private log(method: string, ...args: unknown[]) {
    this.calls.push({ method, args });
  }

  noteOn(pitch: number, velocity: number, time?: number): void {
    this.log('noteOn', pitch, velocity, time);
    this.voices.delete(pitch);
    this.sustained.delete(pitch);
    this.voices.set(pitch, {
      id: this.nextVoiceId++,
      pitch,
      velocity,
      held: true,
      amp: { ...IDLE_ENV, stage: 'attack' },
      filter: { ...IDLE_ENV, stage: 'attack' },
      lfoPhase: 0,
    });
  }

  noteOff(pitch: number, time?: number): void {
    this.log('noteOff', pitch, time);
    if (this.sustain) {
      this.sustained.add(pitch);
      const v = this.voices.get(pitch);
      if (v) v.held = false;
      return;
    }
    this.voices.delete(pitch);
  }

  setSustain(down: boolean, time?: number): void {
    this.log('setSustain', down, time);
    this.sustain = down;
    if (!down) {
      for (const p of this.sustained) this.voices.delete(p);
      this.sustained.clear();
    }
  }

  allNotesOff(): void {
    this.log('allNotesOff');
    this.voices.clear();
    this.sustained.clear();
  }

  setParam<I extends PatchParamId>(id: I, value: ParamValue<I>, time?: number): void {
    this.log('setParam', id, value, time);
    (this.patch.params as Record<string, unknown>)[id] = value;
  }

  getPatch(): Patch {
    return structuredClone(this.patch);
  }

  loadPatch(patch: Patch): void {
    this.log('loadPatch', patch.name);
    this.patch = structuredClone(patch);
  }

  setTempo(bpm: number): void {
    this.log('setTempo', bpm);
    this.tempo = bpm;
  }

  getAnalyser(): AnalyserLike {
    return new SilentAnalyser();
  }

  getVoiceStates(): readonly VoiceState[] {
    return [...this.voices.values()];
  }

  getLfoPhase(): number {
    return 0;
  }

  dispose(): void {
    this.log('dispose');
    this.disposed = true;
    this.voices.clear();
  }

  /** Pitches currently sounding (held or sustained). */
  get soundingPitches(): number[] {
    return [...this.voices.keys()].sort((a, b) => a - b);
  }
}

export class MockAudioHost implements AudioHost {
  state: AudioHostState = 'uninitialised';
  readonly sampleRate = 48000;
  masterDb = -12;
  private listeners = new Set<(s: AudioHostState) => void>();
  private clipped = false;
  /** Tests can advance this to simulate the audio clock. */
  clock = 0;

  get currentTime(): number {
    return this.state === 'running' ? this.clock : 0;
  }

  async start(): Promise<void> {
    this.set('running');
  }
  async stop(): Promise<void> {
    if (this.state === 'running') this.set('suspended');
  }
  setMasterVolumeDb(db: number): void {
    this.masterDb = db;
  }
  getMeter(): MeterReading {
    return { peak: 0, rms: 0, clipped: this.clipped };
  }
  resetClip(): void {
    this.clipped = false;
  }
  getAnalyser(): AnalyserLike {
    return new SilentAnalyser();
  }
  onStateChange(listener: (s: AudioHostState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private set(s: AudioHostState) {
    this.state = s;
    this.listeners.forEach((l) => l(s));
  }
}
