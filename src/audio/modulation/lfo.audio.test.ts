import { describe, expect, it } from 'vitest';
import { defaultPatchParams, type PatchParams } from '@/core/params/registry';
import { findClicks, maxStep, peak, rms, toDb, toneAmplitude } from '../analysis';
import { Voice } from '../voice/voice';
import { createPulseFactory } from '../worklets/pulse';
import { LfoUnit, type LfoSettings } from './lfo';
import { createSampleHoldFactory } from './lfo-source';

const SR = 48000;
// A4 tuned to 480 Hz: note 69 → 480 Hz (100-sample period), note 45 → 120 Hz (400 samples).
const params = (o: Partial<PatchParams> = {}): PatchParams => ({
  ...defaultPatchParams(),
  'master-tune': 480 as never,
  'filter-cutoff': 20000,
  'amp-env-sustain': 1,
  'amp-env-attack': 0.001,
  'osc-a-waveform': 'sine',
  ...o,
});
const lfoDefaults: LfoSettings = { shape: 'sine', rateHz: 2, depth: 1, destination: 'pitch' };

/** Rising zero-crossing instantaneous frequency series: [{t, hz}]. */
function instFreq(x: Float32Array) {
  const crossings: number[] = [];
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1]! < 0 && x[i]! >= 0) crossings.push((i - 1 + -x[i - 1]! / (x[i]! - x[i - 1]!)) / SR);
  }
  return crossings.slice(1).map((t, i) => ({ t: (t + crossings[i]!) / 2, hz: 1 / (t - crossings[i]!) }));
}
const cents = (hz: number, ref: number) => 1200 * Math.log2(hz / ref);
const near = (series: { t: number; hz: number }[], t: number, w = 0.01) => {
  const pts = series.filter((p) => Math.abs(p.t - t) < w);
  return pts.reduce((s, p) => s + p.hz, 0) / pts.length;
};

async function render(seconds: number, build: (ctx: OfflineAudioContext) => void) {
  const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
  build(ctx);
  return (await ctx.startRendering()).getChannelData(0);
}

/** A voice + LFO wired together, as the engine will do it. */
function patchWithLfo(ctx: OfflineAudioContext, p: Partial<PatchParams>, lfo: Partial<LfoSettings>, opts: { pulse?: Awaited<ReturnType<typeof createPulseFactory>>; noteAt?: number; free?: boolean } = {}) {
  const voice = new Voice(ctx, params(p), { pulse: opts.pulse });
  voice.output.connect(ctx.destination);
  const unit = new LfoUnit(ctx, { ...lfoDefaults, ...lfo });
  unit.connect(voice.mod);
  unit.start(0);
  voice.trigger(69, 127, opts.noteAt ?? 0);
  return { voice, unit };
}

describe('LFO shapes and rate (raw output)', () => {
  const raw = (shape: LfoSettings['shape'], rateHz: number, seconds = 2) =>
    render(seconds, (ctx) => {
      const u = new LfoUnit(ctx, { ...lfoDefaults, shape, rateHz });
      u.output.connect(ctx.destination);
      u.start(0);
    });

  it.each([
    ['sine', Math.SQRT1_2],
    ['triangle', 1 / Math.sqrt(3)],
    ['sawtooth', 1 / Math.sqrt(3)],
    ['square', 1],
  ] as const)('%s has the right level and is centred on zero', async (shape, expectedRms) => {
    const out = await raw(shape, 2);
    expect(peak(out)).toBeGreaterThan(0.99);
    expect(peak(out)).toBeLessThan(1.01); // exact ±1: no Gibbs overshoot, no normalisation shortfall
    expect(rms(out)).toBeCloseTo(expectedRms, 2);
    expect(Math.abs(out.reduce((s, v) => s + v, 0) / out.length)).toBeLessThan(0.02);
  });

  it.each([0.5, 2, 7, 20])('runs at %f Hz', async (hz) => {
    const out = await raw('sine', hz, 4);
    let up = 0;
    for (let i = 1; i < out.length; i++) if (out[i - 1]! < 0 && out[i]! >= 0) up++;
    expect(Math.abs(up - hz * 4)).toBeLessThanOrEqual(1);
  });

  it('follows a rate change made while running', async () => {
    const out = await render(4, (ctx) => {
      const u = new LfoUnit(ctx, { ...lfoDefaults, rateHz: 2 });
      u.output.connect(ctx.destination);
      u.start(0);
      u.setRate(8, 2);
    });
    const ups = (a: number, b: number) => {
      let n = 0;
      for (let i = Math.round(a * SR) + 1; i < Math.round(b * SR); i++) if (out[i - 1]! < 0 && out[i]! >= 0) n++;
      return n;
    };
    expect(Math.abs(ups(0, 2) - 4)).toBeLessThanOrEqual(1);
    expect(Math.abs(ups(2.1, 4) - 15)).toBeLessThanOrEqual(2); // 1.9 s × 8 Hz
  });

  it('sample-and-hold holds random values and steps once per cycle', async () => {
    const out = await render(2, async () => {});
    void out;
    const ctx = new OfflineAudioContext(1, SR * 2, SR);
    const sh = await createSampleHoldFactory(ctx);
    const u = new LfoUnit(ctx, { ...lfoDefaults, shape: 'sample-hold', rateHz: 8 }, sh);
    u.output.connect(ctx.destination);
    u.start(0);
    const x = (await ctx.startRendering()).getChannelData(0);
    let changes = 0;
    const values = new Set<number>();
    for (let i = 1; i < x.length; i++) {
      if (x[i] !== x[i - 1]) changes++;
      values.add(x[i]!);
    }
    expect(Math.abs(changes - 16)).toBeLessThanOrEqual(2);
    expect(values.size).toBeGreaterThan(10);
    expect(peak(x)).toBeLessThanOrEqual(1);
  });

  it('changing shape while running crossfades without a step', async () => {
    const out = await render(2, (ctx) => {
      const u = new LfoUnit(ctx, { ...lfoDefaults, shape: 'sine', rateHz: 1 });
      u.output.connect(ctx.destination);
      u.start(0);
      u.setShape('square', 0.6);
      u.setShape('sawtooth', 1.3);
    });
    // Crossfades are 3 ms; a square-to-anything swap spans ≤ 2 over 144 samples. The square edge itself
    // is the one legitimate full-height step, so skip a 10 ms guard around each square edge.
    expect(maxStep(out, Math.round(SR * 0.58), Math.round(SR * 0.595))).toBeLessThan(0.03);
  });
});

describe('LFO destinations on a voice', () => {
  it('pitch: vibrato of ±depth×200 cents at the LFO rate', async () => {
    const out = await render(1, (ctx) => patchWithLfo(ctx, {}, { depth: 0.5, rateHz: 5, destination: 'pitch' }));
    const series = instFreq(out).filter((p) => p.t > 0.05);
    const dev = series.map((p) => cents(p.hz, 480));
    expect(Math.max(...dev)).toBeGreaterThan(100 * 0.85);
    expect(Math.max(...dev)).toBeLessThan(100 * 1.15);
    expect(Math.min(...dev)).toBeLessThan(-100 * 0.85);
    // 5 Hz: peaks at t = 0.05, 0.25, 0.45… so the deviation is +max at 0.05+k·0.2
    expect(cents(near(series, 0.25), 480)).toBeGreaterThan(85);
    expect(cents(near(series, 0.15), 480)).toBeLessThan(-85);
  });

  it('cutoff: sweeps the filter ±depth×4 octaves in time with the LFO', async () => {
    const out = await render(0.6, (ctx) =>
      patchWithLfo(ctx, { 'osc-a-waveform': 'sawtooth', 'filter-cutoff': 400 }, { depth: 1, rateHz: 2, destination: 'cutoff' }),
    );
    // note 69 at 480 Hz: a 4th harmonic (1920 Hz) sits between the two cutoff extremes (25 Hz … 6.4 kHz)
    const h4 = (t: number) => toneAmplitude(out, SR, 1920, Math.round(SR * (t - 0.0083)), 800);
    expect(toDb(h4(0.125)) - toDb(h4(0.375))).toBeGreaterThan(20); // open at LFO peak, closed at trough
  });

  it('amp: tremolo swings between 1 − depth and 1', async () => {
    const level = async (depth: number) => {
      const out = await render(0.6, (ctx) => patchWithLfo(ctx, {}, { depth, rateHz: 2, destination: 'amp' }));
      const win = (t: number) => peak(out, Math.round(SR * (t - 0.005)), Math.round(SR * (t + 0.005)));
      return { hi: win(0.125), lo: win(0.375) };
    };
    const half = await level(0.5);
    expect(half.lo / half.hi).toBeCloseTo(0.5, 1);
    const full = await level(1);
    expect(full.lo / full.hi).toBeLessThan(0.05);
    const none = await level(0);
    expect(none.lo / none.hi).toBeCloseTo(1, 1);
  });

  it('pulse width: PWM moves a 50% pulse towards 95% at the LFO peak', async () => {
    const out = await render(1, async () => {});
    void out;
    const ctx = new OfflineAudioContext(1, SR, SR);
    const pulse = await createPulseFactory(ctx);
    patchWithLfo(ctx, { 'osc-a-waveform': 'pulse', 'osc-a-pulse-width': 0.5 }, { depth: 1, rateHz: 1, destination: 'pulse-width' }, { pulse });
    const x = (await ctx.startRendering()).getChannelData(0);
    const ratio = (t: number) => toneAmplitude(x, SR, 960, Math.round(SR * t), 960) / toneAmplitude(x, SR, 480, Math.round(SR * t), 960);
    expect(ratio(0.49)).toBeLessThan(0.1); // window straddles the LFO zero → ~50% pulse → no 2nd harmonic
    expect(ratio(0.24)).toBeGreaterThan(0.6); // LFO near its peak → ~95% pulse → strong 2nd harmonic
  });

  it('depth 0 leaves the sound untouched, for every destination', async () => {
    const ref = await render(0.5, (ctx) => {
      const v = new Voice(ctx, params());
      v.output.connect(ctx.destination);
      v.trigger(69, 127, 0);
    });
    for (const destination of ['pitch', 'cutoff', 'amp', 'pulse-width'] as const) {
      const out = await render(0.5, (ctx) => patchWithLfo(ctx, {}, { depth: 0, destination }));
      let worst = 0;
      for (let i = 0; i < out.length; i++) worst = Math.max(worst, Math.abs(out[i]! - ref[i]!));
      expect(worst, destination).toBeLessThan(1e-4);
    }
  });

  it('switching destination and depth while playing does not click', async () => {
    const out = await render(1.5, (ctx) => {
      const { unit } = patchWithLfo(ctx, {}, { depth: 0.5, rateHz: 3, destination: 'pitch' });
      unit.setDestination('amp', 0.4);
      unit.setDestination('cutoff', 0.8);
      unit.setDestination('pitch', 1.1);
      unit.setDepth(1, 1.3);
    });
    const natural = ((2 * Math.PI * 480 * 2 ** (200 / 1200)) / SR) * 0.8; // sine at full vibrato depth
    expect(findClicks(out, natural * 1.5)).toEqual([]);
  });
});

describe('retrigger vs free-running', () => {
  it('free-running: the LFO is wherever it was; retrigger: it starts the cycle with the note', async () => {
    const startPitch = async (retrigger: boolean) => {
      const out = await render(0.6, (ctx) => {
        const voice = new Voice(ctx, params());
        voice.output.connect(ctx.destination);
        const unit = new LfoUnit(ctx, { ...lfoDefaults, rateHz: 1, depth: 1, destination: 'pitch' });
        unit.connect(voice.mod);
        unit.start(0);
        if (retrigger) unit.restart(0.25); // what the engine does on note-on in retrigger mode
        voice.trigger(69, 127, 0.25); // 0.25 s into a 1 Hz cycle: the free LFO is at its +1 peak
      });
      return cents(near(instFreq(out), 0.265, 0.012), 480);
    };
    expect(await startPitch(false)).toBeGreaterThan(150); // ≈ +200 cents
    expect(Math.abs(await startPitch(true))).toBeLessThan(45); // just left phase 0
  });

  it('LfoUnit reports its phase for the UI marker, through rate changes and restarts', async () => {
    const ctx = new OfflineAudioContext(1, SR, SR);
    const u = new LfoUnit(ctx, { ...lfoDefaults, rateHz: 2 });
    u.start(0);
    expect(u.phaseAt(0.125)).toBeCloseTo(0.25, 6);
    u.setRate(4, 0.5);
    expect(u.phaseAt(0.5)).toBeCloseTo(0, 6);
    expect(u.phaseAt(0.625)).toBeCloseTo(0.5, 6);
    u.restart(1);
    expect(u.phaseAt(1.0625)).toBeCloseTo(0.25, 6);
  });
});

describe('cleanup', () => {
  it('connect() returns a function that detaches the voice, and dispose() releases the unit', async () => {
    await render(0.2, (ctx) => {
      const voice = new Voice(ctx, params());
      voice.output.connect(ctx.destination);
      const unit = new LfoUnit(ctx, lfoDefaults);
      const detach = unit.connect(voice.mod);
      unit.start(0);
      voice.trigger(69, 100, 0);
      detach();
      expect(() => detach()).not.toThrow();
      unit.dispose();
      expect(() => unit.dispose()).not.toThrow();
    });
  });
});
