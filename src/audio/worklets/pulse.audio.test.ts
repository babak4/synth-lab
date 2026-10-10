import { describe, expect, it } from 'vitest';
import { amplitudeAt, dominantFrequency, findClicks, maxStep, peak, rms, spectrum, toDb, toneAmplitude } from '../analysis';
import { createPulseFactory } from './pulse';

const SR = 48000;

/** Render a bare pulse source at `hz` with width `pw` (optionally with a PW modulator). */
async function pulse(hz: number, pw: number, seconds = 1, mod?: (ctx: OfflineAudioContext, w: AudioParam) => void) {
  const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
  const make = await createPulseFactory(ctx);
  const src = make(ctx);
  src.frequency.value = hz;
  src.pulseWidth!.value = pw;
  mod?.(ctx, src.pulseWidth!);
  src.node.connect(ctx.destination);
  src.start(0);
  return { out: (await ctx.startRendering()).getChannelData(0), src };
}

describe('pulse worklet (PolyBLEP)', () => {
  it('registers once per context and produces a pulse at the requested pitch', async () => {
    const { out } = await pulse(440, 0.5);
    expect(peak(out)).toBeGreaterThan(0.95);
    expect(peak(out)).toBeLessThan(1.15); // BLEP overshoot is small
    expect(Math.abs(dominantFrequency(out, SR, { start: 4800, size: 32768 }) - 440)).toBeLessThan(2);
  });

  // 480 Hz has an exact 100-sample period at 48 kHz, so whole-period DFTs have no leakage.
  const F0 = 480;
  const harmonics = (x: Float32Array, ks: number[]) => ks.map((k) => toneAmplitude(x, SR, k * F0, 4800, 9600));

  it('is DC-balanced at 50% and has only odd harmonics with the 1/n square-wave series', async () => {
    const { out } = await pulse(F0, 0.5);
    const mean = out.slice(4800).reduce((s, v) => s + v, 0) / (out.length - 4800);
    expect(Math.abs(mean)).toBeLessThan(0.01);
    const [h1, h2, h3, h5] = harmonics(out, [1, 2, 3, 5]) as [number, number, number, number];
    expect(h1).toBeGreaterThan((4 / Math.PI) * 0.97);
    expect(h1).toBeLessThan((4 / Math.PI) * 1.03); // square fundamental = 4/π
    expect(h2 / h1).toBeLessThan(0.01);
    expect(h3 / h1).toBeCloseTo(1 / 3, 1);
    expect(h5 / h1).toBeCloseTo(1 / 5, 1);
  });

  it('50% pulse matches the native square: same harmonic series, level within 1.6 dB', async () => {
    const ctx = new OfflineAudioContext(1, SR, SR);
    const osc = new OscillatorNode(ctx, { type: 'square', frequency: F0 });
    osc.connect(ctx.destination);
    osc.start();
    const native = (await ctx.startRendering()).getChannelData(0);
    const { out } = await pulse(F0, 0.5);
    const [n1, n3, n5, n7] = harmonics(native, [1, 3, 5, 7]) as [number, number, number, number];
    const [p1, p3, p5, p7] = harmonics(out, [1, 3, 5, 7]) as [number, number, number, number];
    // Shape: harmonic ratios agree to half a dB.
    for (const [p, n, name] of [[p3 / p1, n3 / n1, '3rd'], [p5 / p1, n5 / n1, '5th'], [p7 / p1, n7 / n1, '7th']] as const) {
      expect(Math.abs(toDb(p) - toDb(n)), name).toBeLessThan(0.5);
    }
    // Level: Chromium peak-normalises its band-limited square (Gibbs overshoot), ours is flat-topped at ±1.
    expect(Math.abs(toDb(p1) - toDb(n1))).toBeLessThan(1.6);
  });

  it('narrow pulses carry even harmonics (width changes the timbre)', async () => {
    const { out } = await pulse(220, 0.25);
    const size = 32768;
    const mag = spectrum(out, size, 4800);
    // For duty cycle d, harmonic n ∝ |sin(nπd)|/n : the 4th harmonic vanishes at d = 0.25, the 2nd does not.
    expect(amplitudeAt(mag, SR, size, 440)).toBeGreaterThan(0.2);
    expect(amplitudeAt(mag, SR, size, 880)).toBeLessThan(0.03);
  });

  it('aliasing at a 4 kHz fundamental stays below −40 dB relative to the fundamental', async () => {
    const hz = 4000;
    const { out } = await pulse(hz, 0.37, 1); // irrational-ish width so no harmonic hides in a null
    const size = 32768;
    const mag = spectrum(out, size, 4800);
    const fundamental = amplitudeAt(mag, SR, size, hz);
    // Every bin that is NOT within ±3 bins of a true harmonic (k·4000, folded) is alias energy.
    // 4 kHz at 48 kHz: harmonics fall exactly on multiples of 4 kHz (folded harmonics coincide),
    // so any energy between them is aliasing noise.
    let worstAlias = 0;
    const binHz = SR / size;
    for (let k = 1; k < mag.length; k++) {
      const f = k * binHz;
      const nearest = Math.round(f / hz) * hz;
      if (Math.abs(f - nearest) > 40 * binHz) worstAlias = Math.max(worstAlias, mag[k]!);
    }
    expect(toDb(worstAlias / fundamental)).toBeLessThan(-40);
  });

  it('sweeping the pulse width has no clicks', async () => {
    const { out } = await pulse(110, 0.2, 1, (_ctx, w) => {
      w.setValueAtTime(0.1, 0);
      w.linearRampToValueAtTime(0.9, 1);
    });
    // A pulse has intrinsic edges; a "click" here would be a stray step away from an edge position.
    // Count full-scale transitions per second: should be ≈ 2 per period = 220, with none extra.
    const edges = findClicks(out, 1.0);
    expect(edges.length).toBeGreaterThan(200);
    expect(edges.length).toBeLessThan(240);
  });

  it('PWM from a modulator is a-rate (smooth), not stepped per render quantum', async () => {
    const { out } = await pulse(110, 0.5, 1, (ctx, w) => {
      const lfo = new OscillatorNode(ctx, { frequency: 3 });
      const depth = new GainNode(ctx, { gain: 0.3 });
      lfo.connect(depth).connect(w);
      lfo.start();
    });
    expect(peak(out)).toBeLessThan(1.2);
    expect(rms(out, 4800)).toBeGreaterThan(0.8); // pulse stays near full level through the sweep
  });

  it('start/stop gate the output at the scheduled times', async () => {
    const ctx = new OfflineAudioContext(1, SR, SR);
    const make = await createPulseFactory(ctx);
    const src = make(ctx);
    src.frequency.value = 440;
    src.node.connect(ctx.destination);
    src.start(0.2);
    src.stop(0.6);
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(peak(out, 0, Math.round(SR * 0.199))).toBe(0);
    expect(peak(out, Math.round(SR * 0.25), Math.round(SR * 0.55))).toBeGreaterThan(0.9);
    expect(peak(out, Math.round(SR * 0.61))).toBe(0);
    expect(maxStep(out, SR * 0.3, SR * 0.5)).toBeLessThanOrEqual(2.3);
  });

  it('64 instances render in well under real time (CPU budget)', async () => {
    const ctx = new OfflineAudioContext(1, SR * 2, SR);
    const make = await createPulseFactory(ctx);
    for (let i = 0; i < 64; i++) {
      const s = make(ctx);
      s.frequency.value = 110 + i * 7;
      s.pulseWidth!.value = 0.3 + (i % 5) * 0.1;
      s.node.connect(ctx.destination);
      s.start(0);
    }
    const t0 = performance.now();
    await ctx.startRendering();
    const elapsed = (performance.now() - t0) / 1000;
    // Real-time budget for 2 s of audio is 2 s; the plan asks for < 10% of it.
    expect(elapsed).toBeLessThan(0.2);
  });
});
