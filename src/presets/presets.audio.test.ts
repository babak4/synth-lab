import { describe, expect, it } from 'vitest';
import { createPatch, type Preset } from '@/core/contracts/patch';
import { mtof } from '@/core/pitch';
import { amplitudeAt, peak, spectrum, toDb } from '@/audio/analysis';
import { fingerprint } from '@/audio/testing/fingerprint';
import { expectGolden } from '@/audio/testing/golden';
import { centroidAt, centroidSeries, highShare, mean, modulationFrequency, rmsSeries, stdDev } from '@/audio/testing/measure';
import { renderPatch } from '@/audio/testing/render';
import { FACTORY_PRESETS } from './index';

const SR = 48000;
const preset = (id: string): Preset => FACTORY_PRESETS.find((p) => p.id === id)!;
const sec = (s: number) => Math.round(SR * s);

async function play(p: Preset, seconds: number, hold = seconds - 0.8, tempo = 120, master = false, pitch = p.auditionPitch!) {
  return renderPatch({ patch: p.patch, notes: [{ pitch, start: 0, duration: hold, velocity: 100 }], seconds, master, tempo });
}
/** The same patch with some parameters overridden: lets a test isolate what one setting contributes. */
const variant = (p: Preset, over: Parameters<typeof createPatch>[1]) => ({ ...p, patch: { ...p.patch, params: { ...p.patch.params, ...over } } });

describe('every factory preset renders cleanly', () => {
  for (const p of FACTORY_PRESETS) {
    it(`${p.name}: sounds, stays finite, and never clips through the master chain`, async () => {
      const { mono, L, R } = await play(p, 3.2, 2.4, 120, true);
      expect(mono.every(Number.isFinite)).toBe(true);
      const pk = Math.max(peak(L), peak(R));
      expect(pk).toBeGreaterThan(0.003); // audible (> −50 dBFS)
      expect(pk).toBeLessThanOrEqual(1);
      expect(toDb(pk)).toBeLessThan(-6); // ample headroom at the default −12 dB master volume
      expect(toDb(pk), `${p.id} peak ${toDb(pk).toFixed(1)} dBFS`).toBeGreaterThan(-30);
    });
  }

  it('sustained presets sit within a few dB of each other (no preset is wildly louder)', async () => {
    const sustained = FACTORY_PRESETS.filter((p) => !['ping-pong-pluck', 'wind-sweep', 'tremolo-keys'].includes(p.id));
    const levels: number[] = [];
    for (const p of sustained) {
      const { mono } = await play(p, 3.2, 2.4, 120, true);
      levels.push(fingerprint(mono, SR, sec(1), sec(1.4)).rmsDb);
    }
    expect(Math.max(...levels) - Math.min(...levels), `spread ${levels.map((l) => l.toFixed(1)).join(', ')}`).toBeLessThan(8);
  });
});

describe('golden renders: a preset keeps sounding like itself', () => {
  for (const p of FACTORY_PRESETS) {
    it(p.name, async () => {
      const pluck = ['ping-pong-pluck', 'plucked-bass', 'acid-squelch'].includes(p.id);
      const { mono } = await play(p, 3.2, 2.4, 120, true);
      await expectGolden(`preset-${p.id}`, pluck ? fingerprint(mono, SR, sec(0.01), sec(0.5)) : fingerprint(mono, SR, sec(0.8), sec(1.4)));
    });
  }
});

describe('each preset’s concept is audible, not just configured', () => {
  it('Plucked Bass: the filter closes quickly, so the note loses its upper harmonics as it rings', async () => {
    const { mono } = await play(preset('plucked-bass'), 1.6, 1.2);
    // The fundamental dominates a bass, so look at the share of energy above 400 Hz (the "pluck").
    const early = highShare(mono, SR, sec(0.005), 400);
    const late = highShare(mono, SR, sec(0.6), 400);
    expect(early, `early ${early.toFixed(3)} vs late ${late.toFixed(3)}`).toBeGreaterThan(late * 3);
  });

  it('Warm Pad: the swell takes the best part of a second to reach full level', async () => {
    const { mono } = await play(preset('warm-pad'), 4, 3);
    const r = rmsSeries(mono, SR, 50, 0, sec(3)).values;
    const full = mean(r.slice(-10));
    const reached80 = r.findIndex((v) => v >= 0.8 * full) * 0.05;
    expect(reached80).toBeGreaterThan(0.5);
    expect(r[1]!).toBeLessThan(0.2 * full);
  });

  it('Vibrato Lead: the wavering pitch spreads the steady tone into sidebands', async () => {
    const p = preset('vibrato-lead');
    const f0 = mtof(p.auditionPitch!);
    const base = { 'delay-on': false, 'filter-cutoff': 20000, 'osc-b-waveform': 'off', 'mix-osc-b': 0, 'voice-glide': 0 } as const;
    const size = 1 << 17;
    const peakNear = (x: Float32Array, hz: number, width: number) => {
      const mag = spectrum(x, size, sec(0.3));
      let m = 0;
      for (let d = -width; d <= width; d += 0.25) m = Math.max(m, amplitudeAt(mag, SR, size, hz + d));
      return m;
    };
    const wavering = (await play(variant(p, base), 3.2, 2.9)).mono;
    const steady = (await play(variant(p, { ...base, 'lfo-depth': 0 }), 3.2, 2.9)).mono;
    // Carrier loses a lot of its energy to sidebands (Bessel J0 at this depth is well below 1)…
    expect(toDb(peakNear(wavering, f0, 8) / peakNear(steady, f0, 8))).toBeLessThan(-4);
    // …and the sidebands sit one LFO rate (5.5 Hz) either side of it.
    const side = peakNear(wavering, f0 + 5.5, 1.5);
    expect(side).toBeGreaterThan(0.05 * peakNear(steady, f0, 8));
  });

  it('Wobble Bass: the brightness pulses at the synced rate (1/8 at 120 BPM = 4 Hz)', async () => {
    const { mono } = await play(preset('wobble-bass'), 3, 2.6, 120);
    const m = modulationFrequency(centroidSeries(mono, SR, 1024, sec(0.3), sec(2.6)), 2, 8);
    expect(Math.abs(m.hz - 4)).toBeLessThan(0.5);
    expect(m.depth, 'wobble is pronounced').toBeGreaterThan(0.1);
    // Follows the tempo: at 90 BPM the same preset wobbles at 3 Hz.
    const slow = await play(preset('wobble-bass'), 3, 2.6, 90);
    expect(Math.abs(modulationFrequency(centroidSeries(slow.mono, SR, 1024, sec(0.3), sec(2.6)), 1.5, 6).hz - 3)).toBeLessThan(0.5);
  });

  it('PWM Strings: the sweeping pulse width keeps changing the tone; with the LFO off it holds still', async () => {
    const p = preset('pwm-strings');
    // One oscillator only: two detuned pulses would beat against each other even without the LFO.
    const one = { 'mix-osc-b': 0, 'reverb-on': false } as const;
    const moving = (await play(variant(p, one), 5, 4.4)).mono;
    const still = (await play(variant(p, { ...one, 'lfo-depth': 0 }), 5, 4.4)).mono;
    const spread = (x: Float32Array) => {
      const c = centroidSeries(x, SR, 2048, sec(1), sec(4.2)).values;
      return stdDev(c) / mean(c);
    };
    expect(spread(moving)).toBeGreaterThan(0.04);
    expect(spread(still)).toBeLessThan(0.015);
  });

  it('Supersaw Lead: two close frequencies instead of one (the detuned pair)', async () => {
    const p = preset('supersaw-lead');
    const f = mtof(p.auditionPitch!);
    const { mono } = await play(variant(p, { 'delay-on': false, 'reverb-on': false, 'filter-cutoff': 20000 }), 4, 3.4);
    const size = 1 << 17;
    const mag = spectrum(mono, size, sec(0.6));
    const lo = f * 2 ** (-14 / 1200);
    const hi = f * 2 ** (14 / 1200);
    const mid = f;
    const at = (hz: number) => amplitudeAt(mag, SR, size, hz);
    expect(at(lo)).toBeGreaterThan(0.02);
    expect(at(hi)).toBeGreaterThan(0.02);
    expect(at(mid), 'a dip between the pair').toBeLessThan(Math.min(at(lo), at(hi)) * 0.5);
  });

  it('Organ: octave-spaced partials and nothing at the third harmonic', async () => {
    const p = preset('organ');
    const f = mtof(p.auditionPitch!);
    const { mono } = await play(variant(p, { 'reverb-on': false }), 3, 2.4);
    const size = 1 << 16;
    const mag = spectrum(mono, size, sec(0.5));
    const at = (hz: number) => amplitudeAt(mag, SR, size, hz);
    for (const hz of [f / 2, f, f * 2]) expect(at(hz), `${hz.toFixed(0)} Hz`).toBeGreaterThan(0.03);
    expect(toDb(at(f * 3) / at(f))).toBeLessThan(-30);
  });

  it('Beating Sines: the level swells and fades about once a second (the beat frequency)', async () => {
    const p = preset('beating-sines');
    const f = mtof(p.auditionPitch!);
    const beat = f * (2 ** (6 / 1200) - 1);
    const { mono } = await play(variant(p, { 'reverb-on': false }), 6, 5.2);
    const m = modulationFrequency(rmsSeries(mono, SR, 20, sec(1), sec(5)), 0.3, 3);
    expect(Math.abs(m.hz - beat), `beat ${beat.toFixed(2)} Hz, measured ${m.hz.toFixed(2)}`).toBeLessThan(0.15);
    expect(m.depth).toBeGreaterThan(0.5);
  });

  it('Acid Squelch: far more energy around the cutoff than the same patch with low resonance', async () => {
    const p = preset('acid-squelch');
    const band = async (q: number) => {
      const { mono } = await play(variant(p, { 'filter-resonance': q, 'dist-on': false }), 1, 0.8);
      const mag = spectrum(mono, 4096, sec(0.05));
      let e = 0;
      for (let k = 0; k < mag.length; k++) {
        const hz = (k * SR) / 4096;
        if (hz > 300 && hz < 2500) e += mag[k]! ** 2;
      }
      return 10 * Math.log10(e);
    };
    expect((await band(14)) - (await band(1))).toBeGreaterThan(4);
  });

  it('Tremolo Keys: the volume pulses at the LFO rate (5 Hz)', async () => {
    const p = preset('tremolo-keys');
    const { mono } = await play(variant(p, { 'reverb-on': false, 'amp-env-decay': 5, 'amp-env-sustain': 1 }), 3, 2.6);
    const m = modulationFrequency(rmsSeries(mono, SR, 10, sec(0.3), sec(2.6)), 2, 9);
    expect(Math.abs(m.hz - 5)).toBeLessThan(0.4);
    expect(m.depth).toBeGreaterThan(0.15);
  });

  it('Ping-Pong Pluck: echoes alternate between the speakers', async () => {
    const p = preset('ping-pong-pluck');
    const { L, R } = await play(variant(p, { 'reverb-on': false }), 3, 0.2, 120);
    // 1/8 at 120 BPM = 0.25 s. Echo n lands at n × 0.25 s, on L for odd n and R for even n.
    const side = (n: number) => {
      const a = sec(0.25 * n - 0.04);
      const b = sec(0.25 * n + 0.1);
      return Math.sign(peak(L, a, b) - peak(R, a, b)) * Math.max(peak(L, a, b), peak(R, a, b));
    };
    expect(side(1)).toBeGreaterThan(0.001);
    expect(side(2)).toBeLessThan(-0.001);
    expect(side(3)).toBeGreaterThan(0.0005);
  });

  it('Wind Sweep: all the sound is noise, and the band moves as the filter sweeps', async () => {
    const p = preset('wind-sweep');
    const { mono } = await play(p, 6, 5);
    const noNoise = (await play(variant(p, { 'mix-noise': 0 }), 6, 5)).mono;
    expect(peak(noNoise), 'with the noise source off nothing is left').toBeLessThan(1e-5);
    const early = centroidAt(mono, SR, sec(0.8));
    const late = centroidAt(mono, SR, sec(3.5));
    expect(Math.abs(late / early - 1), `centroid ${early.toFixed(0)} → ${late.toFixed(0)} Hz`).toBeGreaterThan(0.25);
  });
});
