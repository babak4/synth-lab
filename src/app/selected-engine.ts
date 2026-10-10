/**
 * The engine the keyboard, scope-adjacent plots and Try this talk to: a thin proxy for the selected
 * track's engine. Switching tracks re-points it, so UI code never holds on to a particular engine.
 * With no engine yet (a new track is still loading its worklets) calls are ignored.
 */
import type { AnalyserLike, SynthEngine, VoiceState } from '@/core/contracts/engine';
import type { Patch } from '@/core/contracts/patch';
import type { ParamValue, PatchParamId } from '@/core/params/registry';

const silentAnalyser: AnalyserLike = {
  fftSize: 2048,
  frequencyBinCount: 1024,
  minDecibels: -100,
  maxDecibels: -30,
  getFloatTimeDomainData: (a) => a.fill(0),
  getFloatFrequencyData: (a) => a.fill(-100),
};

export class SelectedEngine implements SynthEngine {
  constructor(private readonly target: () => SynthEngine | undefined, private readonly fallbackPatch: () => Patch) {}

  noteOn(pitch: number, velocity: number, time?: number) {
    this.target()?.noteOn(pitch, velocity, time);
  }
  noteOff(pitch: number, time?: number) {
    this.target()?.noteOff(pitch, time);
  }
  setSustain(down: boolean, time?: number) {
    this.target()?.setSustain(down, time);
  }
  allNotesOff() {
    this.target()?.allNotesOff();
  }
  setParam<I extends PatchParamId>(id: I, value: ParamValue<I>, time?: number) {
    this.target()?.setParam(id, value, time);
  }
  getPatch(): Patch {
    return this.target()?.getPatch() ?? this.fallbackPatch();
  }
  loadPatch(patch: Patch) {
    this.target()?.loadPatch(patch);
  }
  /** Tempo is project-wide; the track manager sets it on every engine, so this is deliberately inert. */
  setTempo() {}
  getAnalyser(): AnalyserLike {
    return this.target()?.getAnalyser() ?? silentAnalyser;
  }
  getVoiceStates(): readonly VoiceState[] {
    return this.target()?.getVoiceStates() ?? [];
  }
  getLfoPhase() {
    return this.target()?.getLfoPhase() ?? 0;
  }
  /** The proxy owns nothing; the track manager disposes engines. */
  dispose() {}
}
