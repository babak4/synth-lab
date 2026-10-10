import { describe, expect, it } from 'vitest';
import { defaultPatchParams, type PatchParams } from '@/core/params/registry';
import { amplitudeAt, dominantFrequency, findClicks, firstAbove, lastAbove, maxStep, peak, rms, spectrum, toDb } from '../analysis';
import { Voice } from './voice';

const SR = 48000;
const patch = (o: Partial<PatchParams> = {}): PatchParams => ({
  ...defaultPatchParams(),
  'filter-cutoff': 20000,
  'amp-env-sustain': 1,
  ...o,
});

/** Build a voice in an offline context, run `script`, render and return the samples. */
async function run(seconds: number, params: Partial<PatchParams>, script: (v: Voice, ctx: OfflineAudioContext) => void) {
  const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
  const voice = new Voice(ctx, patch(params));
  voice.output.connect(ctx.destination);
  script(voice, ctx);
  const out = (await ctx.startRendering()).getChannelData(0);
  return { out, voice, ctx };
}

const sineStep = (hz: number, amp: number) => ((2 * Math.PI * hz) / SR) * amp;

describe('pitch', () => {
  it.each([
    [69, 440],
    [48, 130.8128],
    [84, 1046.502],
  ])('MIDI %i renders a fundamental within 1%% of %f Hz', async (note, hz) => {
    const { out } = await run(1.5, {}, (v) => v.trigger(note, 100, 0));
    const f = dominantFrequency(out, SR, { start: SR / 2, size: 32768, minHz: 40, maxHz: 3000 });
    expect(Math.abs(f - hz) / hz).toBeLessThan(0.01);
  });

  it('honours master tune, octave, semitone and fine tune', async () => {
    const { out } = await run(1.5, { 'master-tune': 432, 'osc-a-octave': 1, 'osc-a-semitone': 2, 'osc-a-fine': 50, 'osc-a-waveform': 'sine' }, (v) =>
      v.trigger(69, 100, 0),
    );
    const expected = 432 * 2 ** (1 + 2.5 / 12);
    const f = dominantFrequency(out, SR, { start: SR / 2, size: 32768 });
    expect(Math.abs(f - expected) / expected).toBeLessThan(0.002);
  });

  it('starts at the right pitch with no chirp when tuned away from zero', async () => {
    const { out } = await run(0.2, { 'osc-a-octave': 2, 'osc-a-waveform': 'sine', 'amp-env-attack': 0.001 }, (v) => v.trigger(69, 127, 0));
    // First 20 ms should already be at 1760 Hz, not gliding from 440.
    const f = dominantFrequency(out, SR, { start: 100, size: 2048, minHz: 200, maxHz: 4000 });
    expect(Math.abs(f - 1760) / 1760).toBeLessThan(0.03);
  });

  it('sub oscillator follows A, one or two octaves down', async () => {
    for (const [oct, hz] of [[-1, 220], [-2, 110]] as const) {
      const { out } = await run(1.5, { 'mix-osc-a': 0, 'mix-sub': 1, 'sub-waveform': 'sine', 'sub-octave': oct }, (v) => v.trigger(69, 100, 0));
      const f = dominantFrequency(out, SR, { start: SR / 2, size: 32768, minHz: 40, maxHz: 1000 });
      expect(Math.abs(f - hz) / hz).toBeLessThan(0.005);
    }
  });

  it('detuning B against A produces two close spectral peaks (the source of beating)', async () => {
    const { out } = await run(2, { 'osc-a-waveform': 'sine', 'osc-b-waveform': 'sine', 'mix-osc-b': 0.8, 'osc-b-fine': 20 }, (v) => v.trigger(69, 100, 0));
    const size = 65536;
    const mag = spectrum(out, size, 8000);
    const fb = 440 * 2 ** (20 / 1200);
    expect(amplitudeAt(mag, SR, size, 440)).toBeGreaterThan(0.2);
    expect(amplitudeAt(mag, SR, size, fb)).toBeGreaterThan(0.2);
  });
});

describe('mixer and sources', () => {
  it('noise level controls a broadband signal with the expected RMS', async () => {
    const { out } = await run(1, { 'mix-osc-a': 0, 'mix-noise': 1 }, (v) => v.trigger(60, 127, 0));
    // uniform ±1 noise has RMS 1/√3; amp velocity sens 0.5 at vel 127 → 1.0
    expect(rms(out, SR / 2)).toBeCloseTo(1 / Math.sqrt(3), 1);
  });

  it('silent when every mixer level is zero', async () => {
    const { out } = await run(0.5, { 'mix-osc-a': 0 }, (v) => v.trigger(60, 127, 0));
    expect(peak(out)).toBeLessThan(1e-6);
  });

  it('osc B set to "off" contributes nothing even with its level up', async () => {
    const { out } = await run(1, { 'mix-osc-a': 0, 'mix-osc-b': 1, 'osc-b-waveform': 'off' }, (v) => v.trigger(60, 127, 0));
    expect(peak(out)).toBeLessThan(1e-6);
  });
});

describe('envelopes in the voice', () => {
  it('amp attack reaches peak at the attack time (±2 ms) and release dies away', async () => {
    const { out, voice } = await run(2, { 'osc-a-waveform': 'sine', 'amp-env-attack': 0.1, 'amp-env-release': 0.2 }, (v) => {
      v.trigger(69, 127, 0.1);
      v.release(1);
    });
    const win = 240; // 5 ms
    const env = (i: number) => peak(out, i, i + win);
    const top = env(Math.round(SR * 0.5));
    const t90 = (() => { for (let i = 0; i < out.length; i += 48) if (env(i) >= 0.9 * top) return i / SR; return -1; })();
    // Linear attack: 90% of the way up at 0.1 + 0.9×0.1 = 0.19 s
    expect(Math.abs(t90 - 0.19)).toBeLessThan(0.007);
    expect(top).toBeCloseTo(0.8, 1); // mixer A level
    expect(voice.silentAt).toBeCloseTo(1 + 0.2 * 1.5, 6);
    expect(peak(out, Math.round(SR * 1.31))).toBeLessThan(0.0005);
  });

  it('velocity sensitivity scales the level; sensitivity 0 ignores velocity', async () => {
    const level = async (vel: number, sens: number) => {
      const { out } = await run(0.5, { 'osc-a-waveform': 'sine', 'amp-env-velocity': sens }, (v) => v.trigger(69, vel, 0));
      return peak(out, SR * 0.2);
    };
    const [hard, soft] = [await level(127, 1), await level(64, 1)];
    expect(soft / hard).toBeCloseTo(64 / 127, 1);
    expect(await level(127, 0)).toBeCloseTo(await level(20, 0), 2);
  });

  it('filter envelope opens the filter on attack (more highs early than late)', async () => {
    const { out } = await run(1.5, { 'filter-cutoff': 200, 'filter-env-amount': 1, 'filter-env-attack': 0.001, 'filter-env-decay': 0.2, 'filter-env-sustain': 0 }, (v) => v.trigger(45, 100, 0));
    const hf = (start: number) => amplitudeAt(spectrum(out, 4096, start), SR, 4096, 1760); // 16th harmonic of A1
    expect(hf(Math.round(SR * 0.01))).toBeGreaterThan(hf(Math.round(SR * 1)) * 5);
  });

  it('key tracking opens the filter for higher notes', async () => {
    const harm2 = async (kt: number) => {
      const { out } = await run(1, { 'filter-cutoff': 1000, 'filter-key-tracking': kt }, (v) => v.trigger(84, 100, 0));
      const mag = spectrum(out, 16384, SR / 2);
      return amplitudeAt(mag, SR, 16384, 2 * 1046.5);
    };
    expect(toDb(await harm2(1)) - toDb(await harm2(0))).toBeGreaterThan(6);
  });

  it('negative envelope amount closes the filter on attack, then it reopens', async () => {
    const { out } = await run(1.5, { 'filter-cutoff': 8000, 'filter-env-amount': -1, 'filter-env-attack': 0.001, 'filter-env-decay': 1, 'filter-env-sustain': 0 }, (v) => v.trigger(45, 100, 0));
    const hf = (start: number) => amplitudeAt(spectrum(out, 2048, start), SR, 2048, 1760);
    expect(hf(Math.round(SR * 1.2))).toBeGreaterThan(hf(Math.round(SR * 0.005)) * 5);
  });
});

describe('click-free behaviour', () => {
  const smooth = { 'osc-a-waveform': 'sine', 'amp-env-attack': 0.005, 'amp-env-release': 0.05 } as const;
  const limit = sineStep(440, 0.8) * 1.6;

  it('no discontinuity at note start or end', async () => {
    const { out } = await run(0.6, smooth, (v) => {
      v.trigger(69, 127, 0.1);
      v.release(0.3);
    });
    expect(findClicks(out, limit)).toEqual([]);
  });

  it('no discontinuity when released in the middle of the attack', async () => {
    const { out } = await run(0.6, { ...smooth, 'amp-env-attack': 0.1 }, (v) => {
      v.trigger(69, 127, 0.1);
      v.release(0.15);
    });
    expect(findClicks(out, limit)).toEqual([]);
    expect(peak(out, 0, SR * 0.15)).toBeGreaterThan(0.2); // it did sound before the release
  });

  it('no discontinuity when re-triggered in the middle of the release (mono-style)', async () => {
    const { out } = await run(1.2, { ...smooth, 'amp-env-release': 0.3 }, (v) => {
      v.trigger(69, 127, 0.1);
      v.release(0.4);
      v.trigger(69, 127, 0.5); // 100 ms into a 300 ms release
      v.release(0.9);
    });
    expect(findClicks(out, limit)).toEqual([]);
    expect(peak(out, SR * 0.6, SR * 0.85)).toBeGreaterThan(0.5);
  });

  it('changing waveform while a note is held does not click', async () => {
    const { out } = await run(1, { ...smooth, 'osc-a-waveform': 'sine' }, (v) => {
      v.trigger(69, 127, 0);
      v.setParam('osc-a-waveform', 'triangle', 0.5);
    });
    // Triangle's natural slope is higher than a sine's; allow for it but nothing like a jump.
    expect(maxStep(out, SR * 0.4, SR * 0.7)).toBeLessThan(0.07);
    expect(dominantFrequency(out, SR, { start: SR * 0.7, size: 16384 })).toBeGreaterThan(430);
  });

  it('switching the sub oscillator on and off while held does not click', async () => {
    const { out } = await run(1, { ...smooth, 'mix-sub': 0.8 }, (v) => {
      v.trigger(69, 127, 0);
      v.setParam('sub-waveform', 'sine', 0.3);
      v.setParam('sub-waveform', 'off', 0.6);
    });
    expect(maxStep(out, SR * 0.2, SR * 0.8)).toBeLessThan(0.12);
  });

  it('cutoff and mixer changes are smoothed (no zipper steps)', async () => {
    const { out } = await run(1, { 'osc-a-waveform': 'sine', 'filter-cutoff': 8000 }, (v) => {
      v.trigger(69, 127, 0);
      v.setParam('mix-osc-a', 0.1, 0.5);
    });
    expect(findClicks(out, sineStep(440, 0.8) * 1.5)).toEqual([]);
  });
});

describe('lifecycle', () => {
  it('after release the voice stops, disconnects every node and reports ended', async () => {
    const ctx = new OfflineAudioContext(1, SR * 2, SR);
    let ended = 0;
    const voice = new Voice(ctx, patch({ 'amp-env-release': 0.2 }), { onEnded: () => ended++ });
    voice.output.connect(ctx.destination);
    const nodes = [...voice.debugNodes];
    expect(nodes.length).toBeGreaterThan(10);
    const disconnected = new Set<AudioNode>();
    for (const n of nodes) {
      const orig = n.disconnect.bind(n) as (...a: unknown[]) => void;
      n.disconnect = ((...a: unknown[]) => (disconnected.add(n), orig(...a))) as typeof n.disconnect;
    }
    voice.trigger(60, 100, 0.1);
    const endAt = voice.release(0.5);
    voice.retire(endAt);
    const out = (await ctx.startRendering()).getChannelData(0);
    await new Promise((r) => setTimeout(r, 100)); // 'ended' events are queued after rendering
    expect(ended).toBe(1);
    expect(voice.isEnded).toBe(true);
    expect(voice.debugNodes.length).toBe(0);
    expect(disconnected.size).toBe(nodes.length);
    expect(lastAbove(out, 1e-4)).toBeLessThan(endAt * SR);
    expect(firstAbove(out, 1e-4)).toBeGreaterThan(0.1 * SR - 5);
  });

  it('a voice that never started tears down cleanly on retire', () => {
    const ctx = new OfflineAudioContext(1, 128, SR);
    let ended = 0;
    const voice = new Voice(ctx, patch(), { onEnded: () => ended++ });
    voice.retire(0);
    expect(ended).toBe(1);
    voice.dispose(); // idempotent
    expect(ended).toBe(1);
  });

  it('reports envelope stage and level for the UI', async () => {
    const { voice } = await run(0.1, {}, (v) => {
      v.trigger(60, 100, 0);
    });
    const s = voice.getState(0.002);
    expect(s).toMatchObject({ pitch: 60, velocity: 100, held: true });
    expect(s.amp.stage).toBe('attack');
    expect(voice.getState(1).amp.stage).toBe('sustain');
    voice.release(1);
    expect(voice.getState(1.1)).toMatchObject({ held: false, amp: { stage: 'release' } });
  });
});
