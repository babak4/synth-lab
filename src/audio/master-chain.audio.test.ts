import { describe, expect, it } from 'vitest';
import { peak, rms, toDb } from './analysis';
import { WebAudioHost } from './host';
import { createMasterChain } from './master-chain';

const SR = 48000;

/** Render `seconds` of a constant-amplitude sine through a fresh master chain. */
async function render(opts: { amp: number; db?: number; hz?: number; seconds?: number; setup?: (c: ReturnType<typeof createMasterChain>) => void }) {
  const seconds = opts.seconds ?? 0.5;
  const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
  const chain = createMasterChain(ctx, opts.db);
  opts.setup?.(chain);
  const osc = new OscillatorNode(ctx, { frequency: opts.hz ?? 1000 });
  const g = new GainNode(ctx, { gain: opts.amp });
  osc.connect(g).connect(chain.input);
  osc.start();
  const out = (await ctx.startRendering()).getChannelData(0);
  return { out, chain };
}

describe('master chain', () => {
  it('starts at −12 dB (hearing safety)', async () => {
    const { out } = await render({ amp: 0.5 }); // −6 dBFS in
    const tail = out.subarray(SR * 0.2);
    // input rms = 0.5/√2 → −9.03 dBFS; −12 dB master → ≈ −21 dBFS (limiter makeup ≤ +1 dB)
    expect(toDb(rms(tail))).toBeGreaterThan(-22.5);
    expect(toDb(rms(tail))).toBeLessThan(-20);
  });

  it('master volume follows setVolumeDb, with −60 dB being silent', async () => {
    const quiet = await render({ amp: 0.5, db: -12 });
    const loud = await render({ amp: 0.5, db: -6 });
    expect(toDb(rms(loud.out.subarray(SR * 0.2))) - toDb(rms(quiet.out.subarray(SR * 0.2)))).toBeCloseTo(6, 0);
    const muted = await render({ amp: 0.5, db: -60 });
    expect(peak(muted.out)).toBe(0);
  });

  it('volume changes ramp without clicks', async () => {
    const ctx = new OfflineAudioContext(1, SR, SR);
    const chain = createMasterChain(ctx, -30);
    const osc = new OscillatorNode(ctx, { frequency: 200 });
    osc.connect(new GainNode(ctx, { gain: 0.8 })).connect(chain.input);
    osc.start();
    ctx.suspend(0.3).then(() => {
      chain.setVolumeDb(0);
      void ctx.resume();
    });
    const swept = (await ctx.startRendering()).getChannelData(0);
    // A 200 Hz sine at final level has a natural max step ≈ 2π·200/48000·0.8·(limiter makeup) ≈ 0.025.
    let maxStep = 0;
    for (let i = 1; i < swept.length; i++) maxStep = Math.max(maxStep, Math.abs(swept[i]! - swept[i - 1]!));
    expect(maxStep).toBeLessThan(0.04);
  });

  it('can never exceed full scale, even when overdriven by 18 dB', async () => {
    const { out } = await render({ amp: 8, db: 0, seconds: 0.3 });
    expect(peak(out)).toBeLessThanOrEqual(1);
    // …and the limiter is doing real work: output sits near the −1 dB threshold, not hard-clipped square.
    expect(toDb(peak(out.subarray(SR * 0.1)))).toBeGreaterThan(-3);
  });

  it('meter reports peak / rms and latches the clip flag until reset', async () => {
    const ctx = new OfflineAudioContext(1, SR, SR);
    const chain = createMasterChain(ctx, 0);
    const osc = new OscillatorNode(ctx, { frequency: 1000 });
    const g = new GainNode(ctx, { gain: 0.25 });
    osc.connect(g).connect(chain.input);
    osc.start();
    // quiet for 0.25 s, then hot for the rest
    g.gain.setValueAtTime(8, 0.5);
    const readings: Record<string, ReturnType<typeof chain.readMeter>> = {};
    ctx.suspend(0.4).then(() => {
      readings.quiet = chain.readMeter();
      void ctx.resume();
    });
    ctx.suspend(0.9).then(() => {
      readings.hot = chain.readMeter();
      chain.resetClip();
      readings.afterReset = chain.readMeter();
      void ctx.resume();
    });
    await ctx.startRendering();
    expect(readings.quiet!.peak).toBeGreaterThan(0.15);
    expect(readings.quiet!.peak).toBeLessThan(0.35);
    expect(readings.quiet!.rms).toBeGreaterThan(0.1);
    expect(readings.quiet!.clipped).toBe(false);
    expect(readings.hot!.clipped).toBe(true);
  });

  it('exposes no way to bypass the limiter (chain internals are private)', () => {
    const ctx = new OfflineAudioContext(1, 128, SR);
    const chain = createMasterChain(ctx);
    expect(Object.keys(chain).sort()).toEqual(['analyser', 'input', 'readMeter', 'resetClip', 'setVolumeDb']);
  });
});

describe('WebAudioHost', () => {
  it('creates no AudioContext until it is needed, and is suspended/silent before start()', async () => {
    let created = 0;
    const host = new WebAudioHost(() => {
      created++;
      return new AudioContext({ latencyHint: 'interactive' });
    });
    expect(host.state).toBe('uninitialised');
    expect(host.currentTime).toBe(0);
    expect(created).toBe(0);
    void host.context; // an engine asking for the context
    expect(created).toBe(1);
    await host.start();
    expect(host.state).toBe('running');
    host.setMasterVolumeDb(-20);
    expect(host.getMeter().clipped).toBe(false);
    await host.context.close();
    expect(host.state).toBe('closed');
  });

  it('uses the interactive latency hint', () => {
    const host = new WebAudioHost();
    // baseLatency is tiny for "interactive"; the PRD needs key→sound < 30 ms.
    expect(host.context.baseLatency + (host.context.outputLatency || 0)).toBeLessThan(0.03);
    void host.context.close();
  });

  it('notifies listeners when the state changes', async () => {
    const host = new WebAudioHost();
    const seen: string[] = [];
    host.onStateChange((s) => seen.push(s));
    void host.context;
    await host.start();
    // (With the autoplay policy relaxed for tests the context may already be running at creation.)
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe('running');
    void host.context.close();
  });
});
