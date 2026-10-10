/** Offline rendering helpers for tests, golden renders and the benchmark (plan T1.8). */
import type { Patch } from '@/core/contracts/patch';
import { createSynthEngine, type SynthEngineImpl } from '../engine';
import { createMasterChain } from '../master-chain';

export interface NoteEvent {
  pitch: number;
  /** Seconds. */
  start: number;
  /** Seconds the key is held. */
  duration: number;
  velocity?: number;
}

export interface RenderOptions {
  patch: Patch;
  notes: NoteEvent[];
  seconds: number;
  sampleRate?: number;
  tempo?: number;
  /** Route through the master chain (limiter, −12 dB start) like the real app. Default: engine output only. */
  master?: boolean;
}

export interface Rendered {
  L: Float32Array;
  R: Float32Array;
  /** (L + R) / 2 */
  mono: Float32Array;
  sampleRate: number;
  engine: SynthEngineImpl;
}

export async function renderPatch(o: RenderOptions): Promise<Rendered> {
  const sampleRate = o.sampleRate ?? 48000;
  const ctx = new OfflineAudioContext(2, Math.round(sampleRate * o.seconds), sampleRate);
  const engine = await createSynthEngine(ctx, o.patch, { janitorMs: 0 });
  if (o.tempo) engine.setTempo(o.tempo);
  if (o.master) engine.output.connect(createMasterChain(ctx).input);
  else engine.output.connect(ctx.destination);
  for (const n of o.notes) {
    engine.noteOn(n.pitch, n.velocity ?? 100, n.start);
    engine.noteOff(n.pitch, n.start + n.duration);
  }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  return { L, R, mono: L.map((v, i) => (v + R[i]!) / 2), sampleRate, engine };
}
