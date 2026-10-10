import { describe, expect, it } from 'vitest';
import { createPatch } from '@/core/contracts/patch';
import { dominantFrequency, peak } from '../analysis';
import { fingerprint } from './fingerprint';
import { expectGolden } from './golden';
import { runOfflineBenchmark } from './benchmark';
import { renderPatch } from './render';

const SR = 48000;
const note = (pitch: number, start = 0, duration = 1.6, velocity = 100) => ({ pitch, start, duration, velocity });
/** Sustained portion of a 2 s render, clear of attack and release. */
const sustained = (x: Float32Array) => fingerprint(x, SR, Math.round(SR * 0.4), Math.round(SR * 1.2));

describe('renderPatch', () => {
  it('renders notes at their scheduled times and holds them for their duration', async () => {
    const { mono } = await renderPatch({
      patch: createPatch('t', { 'osc-a-waveform': 'sine', 'amp-env-release': 0.02, 'amp-env-attack': 0.002 }),
      notes: [note(69, 0.5, 0.5)],
      seconds: 1.5,
    });
    expect(peak(mono, 0, Math.round(SR * 0.49))).toBe(0);
    expect(peak(mono, Math.round(SR * 0.6), Math.round(SR * 0.9))).toBeGreaterThan(0.1);
    expect(peak(mono, Math.round(SR * 1.2))).toBeLessThan(1e-3);
    expect(Math.abs(dominantFrequency(mono, SR, { start: Math.round(SR * 0.55), size: 16384 }) - 440)).toBeLessThan(3);
  });

  it('can route through the master chain (limiter, −12 dB)', async () => {
    const hot = { patch: createPatch('t', { 'mix-osc-a': 1 }), notes: [60, 64, 67, 72].map((p) => note(p)), seconds: 1 };
    const raw = await renderPatch(hot);
    const mastered = await renderPatch({ ...hot, master: true });
    expect(peak(mastered.mono)).toBeLessThan(peak(raw.mono));
    expect(peak(mastered.L)).toBeLessThanOrEqual(1);
  });
});

describe('golden renders', () => {
  it('Init patch: a sustained A3', async () => {
    const { mono } = await renderPatch({ patch: createPatch('Init'), notes: [note(57)], seconds: 2 });
    await expectGolden('init-a3', sustained(mono));
  });

  it('a filter at 800 Hz is darker than the Init patch (the fingerprint can tell)', async () => {
    const { mono } = await renderPatch({ patch: createPatch('Dark', { 'filter-cutoff': 800 }), notes: [note(57)], seconds: 2 });
    const init = await renderPatch({ patch: createPatch('Init'), notes: [note(57)], seconds: 2 });
    expect(sustained(mono).centroidHz).toBeLessThan(sustained(init.mono).centroidHz * 0.7);
    await expectGolden('dark-saw-a3', sustained(mono));
  });

  it('detuned saw pair + sub (a thick sound)', async () => {
    const patch = createPatch('Thick', { 'osc-b-waveform': 'sawtooth', 'mix-osc-b': 0.8, 'osc-b-fine': 14, 'sub-waveform': 'square', 'mix-sub': 0.5, 'filter-cutoff': 3000 });
    const { mono } = await renderPatch({ patch, notes: [note(45)], seconds: 2 });
    await expectGolden('thick-saw-a2', sustained(mono));
  });
});

describe('capacity benchmark (8 tracks × 8 voices, every effect on)', () => {
  it('renders comfortably faster than real time', async () => {
    const r = await runOfflineBenchmark(8, 8, 4);
    // Reported in docs/performance.md; the floor here is a regression canary, not a target.
    console.info(`[bench] ${r.tracks}×${r.voicesPerTrack}: ${r.audioSeconds}s audio in ${r.renderSeconds.toFixed(2)}s = ${r.xRealtime.toFixed(1)}× realtime`);
    expect(r.xRealtime).toBeGreaterThan(1.5);
  }, 120_000);
});
