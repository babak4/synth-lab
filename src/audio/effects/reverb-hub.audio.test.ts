import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPatch } from '@/core/contracts/patch';
import { peak, rms, toDb } from '../analysis';
import { createSynthEngine } from '../engine';
import { ReverbHub } from './reverb-hub';

const SR = 48000;
afterEach(() => vi.useRealTimers());

const wet = { 'reverb-on': true, 'reverb-size': 'room', 'reverb-mix': 0.8, 'osc-a-waveform': 'sawtooth', 'amp-env-release': 0.05 } as const;

/** Render `tracks` engines (each playing its own note) with or without a shared hub. */
async function render(shared: boolean, notes: number[], seconds = 2.5, script?: (engines: Awaited<ReturnType<typeof createSynthEngine>>[]) => void, start = 0) {
  const ctx = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
  const hub = shared ? new ReverbHub(ctx, ctx.destination) : undefined;
  const engines = [];
  for (const [i, n] of notes.entries()) {
    const e = await createSynthEngine(ctx, createPatch('t', { ...wet, 'filter-cutoff': 3000 + i }), { janitorMs: 0, reverbHub: hub });
    e.output.connect(ctx.destination);
    e.noteOn(n, 100, start);
    e.noteOff(n, start + 0.4);
    engines.push(e);
  }
  script?.(engines);
  const buf = await ctx.startRendering();
  return { L: buf.getChannelData(0), R: buf.getChannelData(1), hub, engines };
}

describe('shared reverb hub', () => {
  it('sounds identical to a convolver per track (convolution is linear)', async () => {
    const notes = [48, 55, 64];
    const shared = await render(true, notes);
    // Sum of three single-track renders, each with its own private convolver.
    const parts = await Promise.all(notes.map((n, i) => render(false, [n]).then((r) => ({ r, i }))));
    // Filter cutoff differs per index in `render`, so rebuild the singles with matching cutoffs:
    const singles = [];
    for (const [i, n] of notes.entries()) {
      const ctx = new OfflineAudioContext(2, Math.round(SR * 2.5), SR);
      const e = await createSynthEngine(ctx, createPatch('t', { ...wet, 'filter-cutoff': 3000 + i }), { janitorMs: 0 });
      e.output.connect(ctx.destination);
      e.noteOn(n, 100, 0);
      e.noteOff(n, 0.4);
      singles.push((await ctx.startRendering()).getChannelData(0));
    }
    void parts;
    const sum = new Float32Array(shared.L.length);
    for (const s of singles) for (let i = 0; i < sum.length; i++) sum[i]! += s[i]!;
    let err = 0;
    for (let i = 0; i < sum.length; i++) err += (sum[i]! - shared.L[i]!) ** 2;
    const errRms = Math.sqrt(err / sum.length);
    expect(toDb(errRms / rms(sum))).toBeLessThan(-60); // the same signal to within rounding
    expect(rms(sum, Math.round(SR * 1.5))).toBeGreaterThan(1e-5); // and it does contain a reverb tail
  });

  it('uses one convolver for any number of tracks that share a size', async () => {
    const { hub } = await render(true, [40, 43, 47, 50, 52, 55, 57, 60]);
    expect(hub!.activeConvolvers).toBe(1);
  });

  it('allocates a convolver per size actually in use', async () => {
    const ctx = new OfflineAudioContext(2, SR, SR);
    const hub = new ReverbHub(ctx, ctx.destination);
    const mk = (size: 'short' | 'room' | 'hall') => createSynthEngine(ctx, createPatch('t', { 'reverb-on': true, 'reverb-size': size }), { janitorMs: 0, reverbHub: hub });
    await Promise.all([mk('short'), mk('room'), mk('hall'), mk('hall')]);
    expect(hub.activeConvolvers).toBe(3);
    hub.dispose();
    expect(hub.activeConvolvers).toBe(0);
  });

  it('track gain is applied before the send: muting stops new reverb as well as the dry signal', async () => {
    // The fader moves first (15 ms ramp), then the note plays, as it would in the app.
    const muted = await render(true, [55], 2.5, ([e]) => e!.setTrackGain(0, 0), 0.1);
    expect(peak(muted.L)).toBeLessThan(1e-4);
    const open = await render(true, [55], 2.5, undefined, 0.1);
    expect(peak(open.L)).toBeGreaterThan(0.01);
    // Half gain = half the dry AND half the wet (post-fader send), so the whole mix halves.
    const half = await render(true, [55], 2.5, ([e]) => e!.setTrackGain(0.5, 0), 0.1);
    expect(toDb(rms(half.L) / rms(open.L))).toBeCloseTo(-6, 0);
  });

  it('releases a convolver after its last send detaches and the tail has run out', async () => {
    vi.useFakeTimers();
    const ctx = new OfflineAudioContext(2, SR, SR);
    const hub = new ReverbHub(ctx, ctx.destination);
    const src = new GainNode(ctx);
    const a = hub.attach('short', src);
    const b = hub.attach('short', src);
    expect(hub.activeConvolvers).toBe(1);
    a.detach();
    vi.advanceTimersByTime(10_000);
    expect(hub.activeConvolvers).toBe(1); // b still attached
    b.detach();
    b.detach(); // idempotent
    vi.advanceTimersByTime(300);
    expect(hub.activeConvolvers).toBe(1); // tail still ringing out
    const c = hub.attach('short', src); // re-attached before release: kept
    vi.advanceTimersByTime(10_000);
    expect(hub.activeConvolvers).toBe(1);
    c.detach();
    vi.advanceTimersByTime(10_000);
    expect(hub.activeConvolvers).toBe(0);
    hub.dispose();
  });
});
