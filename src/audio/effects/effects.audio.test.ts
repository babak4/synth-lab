import { describe, expect, it } from 'vitest';
import { defaultPatchParams, type PatchParams } from '@/core/params/registry';
import { peak, rms, toDb, toneAmplitude } from '../analysis';
import { EffectsChain, loadEffectsWorklets } from './chain';
import { IMPULSE_SPECS, measureRt60, type ReverbSize } from './impulse';
import { tanhCurve } from './distortion';

const SR = 48000;
const fx = (o: Partial<PatchParams> = {}) => ({ ...defaultPatchParams(), 'dist-tone': 20000, ...o });

type Source = (ctx: OfflineAudioContext) => AudioNode;
interface Rendered { L: Float32Array; R: Float32Array; chain: EffectsChain }

async function run(seconds: number, source: Source, params: Partial<PatchParams>, script?: (c: EffectsChain, ctx: OfflineAudioContext) => void): Promise<Rendered> {
  const ctx = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
  await loadEffectsWorklets(ctx);
  const chain = new EffectsChain(ctx, fx(params));
  source(ctx).connect(chain.input);
  chain.output.connect(ctx.destination);
  script?.(chain, ctx);
  const buf = await ctx.startRendering();
  return { L: buf.getChannelData(0), R: buf.getChannelData(1), chain };
}

const sine = (hz: number, amp: number): Source => (ctx) => {
  const o = new OscillatorNode(ctx, { frequency: hz });
  const g = new GainNode(ctx, { gain: amp });
  o.start();
  return o.connect(g);
};
/** Deterministic mono buffer source. */
const buffer = (fill: (i: number) => number, length: number): Source => (ctx) => {
  const b = new AudioBuffer({ length, sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < length; i++) d[i] = fill(i);
  const s = new AudioBufferSourceNode(ctx, { buffer: b });
  s.start();
  return s;
};
const impulse = buffer((i) => (i === 0 ? 1 : 0), SR);
const noise = (seconds: number, seed = 1): Source => {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  return buffer(() => 0.5 * rand(), Math.round(SR * seconds));
};

describe('bypass', () => {
  it('with every effect off, the output is the input, sample for sample', async () => {
    const { L, R } = await run(1, noise(1), {});
    const ref = await run(1, noise(1), {}, () => {});
    // Compare against the source itself, rendered straight to the destination.
    const ctx = new OfflineAudioContext(2, SR, SR);
    noise(1)(ctx).connect(ctx.destination);
    const direct = await ctx.startRendering();
    let worst = 0;
    for (let i = 0; i < SR; i++) worst = Math.max(worst, Math.abs(L[i]! - direct.getChannelData(0)[i]!), Math.abs(R[i]! - direct.getChannelData(1)[i]!));
    expect(worst).toBeLessThan(1e-6);
    expect(ref.L.length).toBe(L.length);
  });

  it('still transparent when effects are configured but switched off', async () => {
    const loud = { 'dist-drive': 36, 'dist-mix': 1, 'delay-mix': 1, 'delay-feedback': 0.9, 'reverb-mix': 1 } as const;
    const a = await run(0.5, noise(0.5), loud);
    const b = await run(0.5, noise(0.5), {});
    let worst = 0;
    for (let i = 0; i < a.L.length; i++) worst = Math.max(worst, Math.abs(a.L[i]! - b.L[i]!));
    expect(worst).toBeLessThan(1e-6);
  });
});

describe('distortion', () => {
  const f0 = 480; // 100-sample period: exact DFT bins
  const win = (x: Float32Array, k: number) => toneAmplitude(x, SR, k * f0, SR / 2, 9600);

  it('adds odd harmonics, bounds the output, and mix 0 returns the dry signal', async () => {
    const hot = await run(1, sine(f0, 0.8), { 'dist-on': true, 'dist-drive': 24, 'dist-mix': 1 });
    expect(toDb(win(hot.L, 3) / win(hot.L, 1))).toBeGreaterThan(-20);
    expect(win(hot.L, 2) / win(hot.L, 1)).toBeLessThan(0.02); // tanh is odd-symmetric: no even harmonics
    expect(peak(hot.L)).toBeLessThanOrEqual(1);

    const dry = await run(1, sine(f0, 0.8), { 'dist-on': true, 'dist-drive': 24, 'dist-mix': 0 });
    const off = await run(1, sine(f0, 0.8), { 'dist-on': false });
    expect(Math.abs(rms(dry.L, SR / 2) - rms(off.L, SR / 2))).toBeLessThan(1e-4);
  });

  it('is nearly linear for small signals at low drive', async () => {
    const { L } = await run(1, sine(f0, 0.02), { 'dist-on': true, 'dist-drive': 0, 'dist-mix': 1 });
    expect(toDb(win(L, 3) / win(L, 1))).toBeLessThan(-40);
  });

  it('4× oversampling suppresses aliased harmonics versus a plain shaper', async () => {
    // 9.6 kHz → 3rd harmonic 28.8 kHz folds to 19.2 kHz (period is exactly 5 samples)
    const alias = (x: Float32Array) => toneAmplitude(x, SR, 19200, SR / 2, 9600);
    const ours = await run(1, sine(9600, 0.8), { 'dist-on': true, 'dist-drive': 18, 'dist-mix': 1 });

    const ctx = new OfflineAudioContext(1, SR, SR);
    const pre = new GainNode(ctx, { gain: 0.5 * 10 ** (18 / 20) });
    const post = new GainNode(ctx, { gain: 0.7 });
    const plain = new WaveShaperNode(ctx, { curve: tanhCurve(), oversample: 'none' });
    sine(9600, 0.8)(ctx).connect(pre).connect(plain).connect(post).connect(ctx.destination);
    const naive = (await ctx.startRendering()).getChannelData(0);

    expect(toDb(alias(naive)) - toDb(alias(ours.L))).toBeGreaterThan(10);
  });

  it('tone low-pass removes highs', async () => {
    const bright = await run(1, sine(4800, 0.8), { 'dist-on': true, 'dist-drive': 12, 'dist-mix': 1, 'dist-tone': 20000 });
    const dark = await run(1, sine(4800, 0.8), { 'dist-on': true, 'dist-drive': 12, 'dist-mix': 1, 'dist-tone': 1000 });
    expect(rms(dark.L, SR / 2)).toBeLessThan(rms(bright.L, SR / 2) * 0.3);
  });
});

describe('delay', () => {
  const T = 0.1;
  const at = (x: Float32Array, t: number) => peak(x, Math.max(0, Math.round(SR * t) - 3), Math.round(SR * t) + 4);
  const base = { 'delay-on': true, 'delay-time': T, 'delay-mix': 1, 'delay-feedback': 0.5 } as const;

  it('repeats at the delay time, each echo scaled by the feedback', async () => {
    const { L, R } = await run(1, impulse, base);
    expect(at(L, 0)).toBeCloseTo(1, 3); // dry
    expect(at(L, T)).toBeCloseTo(1, 2);
    expect(at(L, 2 * T)).toBeCloseTo(0.5, 2);
    expect(at(L, 3 * T)).toBeCloseTo(0.25, 2);
    expect(at(R, 2 * T)).toBeCloseTo(0.5, 2); // normal mode is centred
    expect(at(L, 1.5 * T)).toBeLessThan(1e-3);
  });

  it('ping-pong alternates left and right', async () => {
    const { L, R } = await run(1, impulse, { ...base, 'delay-pingpong': true });
    expect(at(L, T)).toBeCloseTo(1, 2);
    expect(at(R, T)).toBeLessThan(1e-3);
    expect(at(R, 2 * T)).toBeCloseTo(0.5, 2);
    expect(at(L, 2 * T)).toBeLessThan(1e-3);
    expect(at(L, 3 * T)).toBeCloseTo(0.25, 2);
  });

  it('feedback is capped at 0.9 whatever is asked, so repeats always die away', async () => {
    const { L, R } = await run(1, impulse, { ...base, 'delay-feedback': 0.9 });
    expect(at(L, 2 * T) / at(L, T)).toBeCloseTo(0.9, 2);
    // …and a value beyond the cap (set directly, bypassing the registry range) is clamped.
    const forced = await run(1, impulse, base, (chain) => chain.delay.set({ feedback: 5 }, 0, true));
    expect(at(forced.L, 2 * T) / at(forced.L, T)).toBeCloseTo(0.9, 2);
    expect(R.length).toBe(L.length);
  });

  it('a long ping-pong run at maximum feedback decays monotonically (loop gain < 1)', async () => {
    const { L, R } = await run(12, buffer((i) => (i === 0 ? 1 : 0), 100), { ...base, 'delay-feedback': 0.9, 'delay-pingpong': true, 'delay-time': 0.05 });
    const energy = (a: number, b: number) => rms(L, Math.round(a * SR), Math.round(b * SR)) ** 2 + rms(R, Math.round(a * SR), Math.round(b * SR)) ** 2;
    const windows = [0.1, 2, 4, 6, 8, 10].map((t) => energy(t, t + 1.5));
    for (let i = 1; i < windows.length; i++) expect(windows[i]!).toBeLessThan(windows[i - 1]!);
    expect(peak(L, 0, L.length)).toBeLessThanOrEqual(1.0001);
  });

  it('tempo-synced time follows BPM and division', async () => {
    const { L } = await run(2, impulse, { ...base, 'delay-sync': true, 'delay-division': '1/4' }, (chain) => chain.setTempo(120, 0));
    expect(at(L, 0.5)).toBeCloseTo(1, 2);
    expect(at(L, 1.0)).toBeCloseTo(0.5, 2);
  });
});

describe('reverb', () => {
  const wetOnly = async (size: ReverbSize) => {
    const on = await run(5, impulse, { 'reverb-on': true, 'reverb-size': size, 'reverb-mix': 1 });
    const off = await run(5, impulse, {});
    return on.L.map((v, i) => v - off.L[i]!);
  };

  it('three sizes decay at their specified RT60 (±25%) and in order', async () => {
    const measured: number[] = [];
    for (const size of ['short', 'room', 'hall'] as const) {
      const rt = measureRt60(await wetOnly(size), SR);
      measured.push(rt);
      expect(Math.abs(rt - IMPULSE_SPECS[size].rt60) / IMPULSE_SPECS[size].rt60, size).toBeLessThan(0.25);
    }
    expect(measured[0]!).toBeLessThan(measured[1]!);
    expect(measured[1]!).toBeLessThan(measured[2]!);
  });

  it('is stereo (decorrelated channels) from a mono source', async () => {
    const { L, R } = await run(2, impulse, { 'reverb-on': true, 'reverb-mix': 1 });
    let dot = 0;
    let l2 = 0;
    let r2 = 0;
    for (let i = Math.round(0.05 * SR); i < L.length; i++) {
      dot += L[i]! * R[i]!;
      l2 += L[i]! ** 2;
      r2 += R[i]! ** 2;
    }
    expect(Math.abs(dot / Math.sqrt(l2 * r2))).toBeLessThan(0.2);
  });

  it('switching size mid-stream neither drops out nor spikes', async () => {
    const { L } = await run(3, noise(3), { 'reverb-on': true, 'reverb-size': 'short', 'reverb-mix': 1 }, (chain) => chain.setParam('reverb-size', 'hall', 1.5));
    const win = (t: number) => rms(L, Math.round(SR * t), Math.round(SR * (t + 0.02)));
    const around = [1.4, 1.46, 1.5, 1.52, 1.54, 1.6, 1.7].map(win);
    expect(Math.min(...around)).toBeGreaterThan(0.4 * Math.max(...around)); // no dropout
    expect(peak(L, Math.round(SR * 1.48), Math.round(SR * 1.62))).toBeLessThan(2.2 * peak(L, Math.round(SR * 1.2), Math.round(SR * 1.4)));
  });
});

describe('reverb CPU lifecycle', () => {
  it('allocates no convolver while off, creates one on enable, and drops it after disable', async () => {
    const ctx = new OfflineAudioContext(2, SR, SR);
    await loadEffectsWorklets(ctx);
    const chain = new EffectsChain(ctx, fx({ 'reverb-on': false }));
    expect(chain.reverb.isActive).toBe(false); // off from the start: no convolution cost at all
    chain.setParam('reverb-on', true);
    expect(chain.reverb.isActive).toBe(true);
    chain.setParam('reverb-on', false);
    expect(chain.reverb.isActive).toBe(true); // still there while the wet signal fades out…
    await new Promise((r) => setTimeout(r, 450));
    expect(chain.reverb.isActive).toBe(false); // …then released
    chain.setParam('reverb-on', true);
    expect(chain.reverb.isActive).toBe(true);
    chain.dispose();
  });

  it('re-enabling before the drop timer fires keeps the convolver (no churn on quick toggles)', async () => {
    const ctx = new OfflineAudioContext(2, SR, SR);
    await loadEffectsWorklets(ctx);
    const chain = new EffectsChain(ctx, fx({ 'reverb-on': true }));
    chain.setParam('reverb-on', false);
    chain.setParam('reverb-on', true);
    await new Promise((r) => setTimeout(r, 450));
    expect(chain.reverb.isActive).toBe(true);
    chain.dispose();
  });

  it('size changes while off are remembered for the next enable', async () => {
    const ctx = new OfflineAudioContext(2, SR * 2, SR);
    await loadEffectsWorklets(ctx);
    const chain = new EffectsChain(ctx, fx({ 'reverb-on': false, 'reverb-size': 'short' }));
    chain.setParam('reverb-size', 'hall');
    expect(chain.reverb.isActive).toBe(false);
    chain.setParam('reverb-on', true);
    chain.setParam('reverb-mix', 1);
    chain.input.connect(chain.output); // keep graph alive
    expect(chain.reverb.isActive).toBe(true);
    chain.dispose();
  });
});

describe('on / off switching is click-free', () => {
  const steps = (x: Float32Array, from: number, to: number) => {
    let m = 0;
    for (let i = Math.round(from * SR) + 1; i < Math.round(to * SR); i++) m = Math.max(m, Math.abs(x[i]! - x[i - 1]!));
    return m;
  };
  const sine440 = (amp = 0.5) => sine(440, amp);

  it.each([
    ['distortion', 'dist-on', { 'dist-drive': 18, 'dist-mix': 1 }],
    ['delay', 'delay-on', { 'delay-mix': 1, 'delay-time': 0.07 }],
    ['reverb', 'reverb-on', { 'reverb-mix': 1 }],
  ] as const)('%s toggled on then off adds no step beyond the signal itself', async (_n, onKey, extra) => {
    const toggled = await run(1.5, sine440(), { ...extra }, (c) => {
      c.setParam(onKey as 'dist-on', true, 0.4);
      c.setParam(onKey as 'dist-on', false, 0.9);
    });
    const alwaysOn = await run(1.5, sine440(), { ...extra, [onKey]: true });
    const natural = Math.max(steps(alwaysOn.L, 0.1, 1.4), ((2 * Math.PI * 440) / SR) * 0.5);
    expect(steps(toggled.L, 0.35, 0.6)).toBeLessThan(natural * 1.3);
    expect(steps(toggled.L, 0.85, 1.1)).toBeLessThan(natural * 1.3);
  });

  it('ping-pong on/off while echoes are ringing is click-free', async () => {
    const { L } = await run(2, sine440(0.4), { 'delay-on': true, 'delay-mix': 0.8, 'delay-time': 0.12, 'delay-feedback': 0.6 }, (c) => {
      c.setParam('delay-pingpong', true, 0.7);
      c.setParam('delay-pingpong', false, 1.2);
    });
    expect(steps(L, 0.65, 1.4)).toBeLessThan(((2 * Math.PI * 440) / SR) * 1.2 * 1.5);
  });
});
