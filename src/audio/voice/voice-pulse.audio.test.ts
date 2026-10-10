import { describe, expect, it } from 'vitest';
import { defaultPatchParams, type PatchParams } from '@/core/params/registry';
import { findClicks, toneAmplitude } from '../analysis';
import { createPulseFactory } from '../worklets/pulse';
import { Voice } from './voice';

const SR = 48000;
// A4 tuned to 480 Hz → exact 100-sample period for leakage-free harmonic measurement.
const base = (o: Partial<PatchParams> = {}): PatchParams => ({
  ...defaultPatchParams(),
  'master-tune': 480 as never,
  'filter-cutoff': 20000,
  'amp-env-sustain': 1,
  'amp-env-attack': 0.001,
  ...o,
});

async function run(params: Partial<PatchParams>, script: (v: Voice) => void, withPulse = true, seconds = 1.2) {
  const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
  const pulse = withPulse ? await createPulseFactory(ctx) : undefined;
  const voice = new Voice(ctx, base(params), { pulse });
  voice.output.connect(ctx.destination);
  script(voice);
  return (await ctx.startRendering()).getChannelData(0);
}
const h = (x: Float32Array, k: number, from = 0.6) => toneAmplitude(x, SR, k * 480, Math.round(SR * from), 9600);

describe('Voice with the pulse worklet', () => {
  it('pulse width shapes the timbre: 25% has a 2nd harmonic, 50% does not', async () => {
    const wide = await run({ 'osc-a-waveform': 'pulse', 'osc-a-pulse-width': 0.5 }, (v) => v.trigger(69, 127, 0));
    const narrow = await run({ 'osc-a-waveform': 'pulse', 'osc-a-pulse-width': 0.25 }, (v) => v.trigger(69, 127, 0));
    expect(h(wide, 2) / h(wide, 1)).toBeLessThan(0.02);
    expect(h(narrow, 2) / h(narrow, 1)).toBeGreaterThan(0.4); // |sin(2π·.25)|/2 ÷ |sin(π·.25)| ≈ 0.71
  });

  it('live pulse-width changes are smooth', async () => {
    const out = await run({ 'osc-a-waveform': 'pulse', 'osc-a-pulse-width': 0.5 }, (v) => {
      v.trigger(69, 127, 0);
      v.setParam('osc-a-pulse-width', 0.15, 0.5);
    });
    expect(h(out, 2, 0.8) / h(out, 1, 0.8)).toBeGreaterThan(0.4);
    // No stray steps beyond the pulse edges themselves (edge steps ≈ 2 × mixer level 0.8).
    expect(findClicks(out, 2 * 0.8 * 1.35).length).toBe(0);
  });

  it('switching from saw to pulse mid-note crossfades without a click', async () => {
    const out = await run({ 'osc-a-waveform': 'sine' }, (v) => {
      v.trigger(69, 127, 0);
      v.setParam('osc-a-waveform', 'pulse', 0.4);
    });
    // After the swap the signal is a 50% pulse: strong odd harmonics.
    expect(h(out, 3, 0.7) / h(out, 1, 0.7)).toBeCloseTo(1 / 3, 1);
    // Complementary linear fades never sum above the mixer level (0.8), so the swap cannot overload.
    let peak = 0;
    for (let i = Math.round(SR * 0.38); i < Math.round(SR * 0.46); i++) peak = Math.max(peak, Math.abs(out[i]!));
    expect(peak).toBeLessThan(0.8 * 1.15);
    expect(peak).toBeGreaterThan(0.6); // …and there is no dropout either
  });

  it('PWM: the voice exposes a pulse-width mod input that moves the width', async () => {
    const ctx = new OfflineAudioContext(1, SR, SR);
    const pulse = await createPulseFactory(ctx);
    const voice = new Voice(ctx, base({ 'osc-a-waveform': 'pulse', 'osc-a-pulse-width': 0.5 }), { pulse });
    voice.output.connect(ctx.destination);
    const offset = new ConstantSourceNode(ctx, { offset: -0.25 }); // 0.5 − 0.25 = 25% width
    offset.connect(voice.mod.pulseWidth);
    offset.start();
    voice.trigger(69, 127, 0);
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(toneAmplitude(out, SR, 960, Math.round(SR * 0.5), 9600) / toneAmplitude(out, SR, 480, Math.round(SR * 0.5), 9600)).toBeGreaterThan(0.4);
  });

  it('falls back to a square when no pulse factory is supplied', async () => {
    const out = await run({ 'osc-a-waveform': 'pulse', 'osc-a-pulse-width': 0.25 }, (v) => v.trigger(69, 127, 0), false);
    expect(h(out, 2) / h(out, 1)).toBeLessThan(0.02); // square, ignoring the requested width
  });
});
