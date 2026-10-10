/**
 * Capacity benchmark (plan T1.8, PRD §7.4): N tracks × M voices with every effect on.
 * Offline, so it measures raw DSP cost deterministically: how many times faster than real time the
 * engine renders. The realtime page (bench.html) additionally reports live underruns.
 */
import { createPatch } from '@/core/contracts/patch';
import { createSynthEngine } from '../engine';
import { ReverbHub } from '../effects/reverb-hub';

export interface BenchResult {
  tracks: number;
  voicesPerTrack: number;
  audioSeconds: number;
  renderSeconds: number;
  /** Audio seconds produced per wall-clock second. Must stay well above 1 to leave headroom. */
  xRealtime: number;
}

export async function runOfflineBenchmark(tracks = 8, voicesPerTrack = 8, audioSeconds = 4, sampleRate = 48000, shareReverb = true): Promise<BenchResult> {
  const ctx = new OfflineAudioContext(2, Math.round(sampleRate * audioSeconds), sampleRate);
  const patch = createPatch('bench', {
    'osc-a-waveform': 'sawtooth',
    'osc-b-waveform': 'pulse',
    'mix-osc-b': 0.6,
    'mix-sub': 0.4,
    'sub-waveform': 'sine',
    'mix-noise': 0.05,
    'osc-b-fine': 12,
    'filter-cutoff': 1800,
    'filter-resonance': 6,
    'filter-env-amount': 0.5,
    'lfo-depth': 0.3,
    'lfo-destination': 'cutoff',
    'amp-env-sustain': 1,
    'dist-on': true,
    'delay-on': true,
    'delay-pingpong': true,
    'delay-feedback': 0.6,
    'reverb-on': true,
    'reverb-size': 'hall',
  });
  const reverbHub = shareReverb ? new ReverbHub(ctx, ctx.destination) : undefined;
  for (let t = 0; t < tracks; t++) {
    const engine = await createSynthEngine(ctx, patch, { janitorMs: 0, reverbHub });
    engine.output.connect(ctx.destination);
    for (let v = 0; v < voicesPerTrack; v++) engine.noteOn(36 + t * 3 + v * 2, 100, 0);
  }
  const t0 = performance.now();
  await ctx.startRendering();
  const renderSeconds = (performance.now() - t0) / 1000;
  return { tracks, voicesPerTrack, audioSeconds, renderSeconds, xRealtime: audioSeconds / renderSeconds };
}
