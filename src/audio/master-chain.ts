/**
 * Master chain (plan T1.1):
 *   sources → input → masterGain → limiter (compressor) → analyser → hard clipper → destination
 *
 * Safety (PRD §7.4): the limiter and clipper are not exposed and have no bypass. The clipper
 * guarantees |output| ≤ 1 even where the compressor overshoots. Master volume starts at −12 dB.
 */
import type { AnalyserLike, MeterReading } from '@/core/contracts/engine';
import { fromDb, peak, rms } from './analysis';

export const DEFAULT_MASTER_DB = -12;
/** At or below this the master gain is exactly 0 (the fader's "−∞"). */
export const MASTER_FLOOR_DB = -60;
const VOLUME_RAMP_S = 0.015;
const CLIP_LEVEL = 0.999;

export const dbToGain = (db: number): number => (db <= MASTER_FLOOR_DB ? 0 : fromDb(db));

export interface MasterChain {
  /** Connect every source here. */
  readonly input: AudioNode;
  readonly analyser: AnalyserLike;
  setVolumeDb(db: number): void;
  /** Reads the latest analyser window. `clipped` latches until `resetClip()`. */
  readMeter(): MeterReading;
  resetClip(): void;
}

export function createMasterChain(ctx: BaseAudioContext, initialDb = DEFAULT_MASTER_DB): MasterChain {
  const input = new GainNode(ctx, { gain: 1 });
  const master = new GainNode(ctx, { gain: dbToGain(initialDb) });

  const limiter = new DynamicsCompressorNode(ctx, {
    threshold: -1,
    knee: 0,
    ratio: 20,
    attack: 0.001,
    release: 0.1,
  });

  const analyser = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0.8 });

  // Identity inside ±1, clamps outside: a two-point curve is a hard clipper.
  const clipper = new WaveShaperNode(ctx, { curve: new Float32Array([-1, 1]), oversample: 'none' });

  input.connect(master).connect(limiter).connect(analyser).connect(clipper).connect(ctx.destination);

  const block = new Float32Array(analyser.fftSize);
  let clipped = false;

  return {
    input,
    analyser,
    setVolumeDb(db) {
      const g = dbToGain(db);
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(g, ctx.currentTime, VOLUME_RAMP_S / 3);
    },
    readMeter() {
      analyser.getFloatTimeDomainData(block);
      const p = peak(block);
      if (p >= CLIP_LEVEL) clipped = true;
      return { peak: p, rms: rms(block), clipped };
    },
    resetClip() {
      clipped = false;
    },
  };
}
