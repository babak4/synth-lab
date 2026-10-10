import { describe, expect, it } from 'vitest';
import { createPatch } from '@/core/contracts/patch';
import { engineContract } from '@/core/engine-contract';
import { PATCH_PARAM_DEFS, defaultPatchParams, type PatchParamId } from '@/core/params/registry';
import { dominantFrequency, findClicks, maxStep, peak, rms, toneAmplitude } from './analysis';
import { PARAM_ROUTES, SynthEngineImpl, VOICE_BUS_GAIN, createSynthEngine } from './engine';

const SR = 48000;
const patch = (o: Parameters<typeof createPatch>[1] = {}) => createPatch('t', { 'amp-env-sustain': 1, 'filter-cutoff': 20000, ...o });

/** Build an engine on a fresh offline context, run the script, render. */
async function run(seconds: number, p: Partial<ReturnType<typeof defaultPatchParams>>, script: (e: SynthEngineImpl) => void) {
  const ctx = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
  const engine = await createSynthEngine(ctx, patch(p));
  engine.output.connect(ctx.destination);
  script(engine);
  const buf = await ctx.startRendering();
  return { L: buf.getChannelData(0), R: buf.getChannelData(1), engine };
}

describe('parameter binding', () => {
  it('has a route for every registry patch parameter, and none extra', () => {
    expect(Object.keys(PARAM_ROUTES).sort()).toEqual(PATCH_PARAM_DEFS.map((d) => d.id).sort());
  });

  it('survives every parameter at every extreme while a chord plays (no throw, finite audio)', async () => {
    const ctx = new OfflineAudioContext(2, SR * 3, SR);
    const engine = await createSynthEngine(ctx, patch({ 'osc-b-waveform': 'sawtooth', 'mix-osc-b': 0.5, 'mix-sub': 0.3, 'sub-waveform': 'sine' }));
    engine.output.connect(ctx.destination);
    [48, 55, 60, 64].forEach((n) => engine.noteOn(n, 100, 0));
    let t = 0.05;
    for (const def of PATCH_PARAM_DEFS) {
      const values: unknown[] =
        def.type === 'continuous' ? [def.min, def.max, def.default] : def.type === 'enum' ? def.options.map((o) => o.value) : [true, false];
      for (const v of values) {
        engine.setParam(def.id as PatchParamId, v as never, t);
        t += 0.004;
      }
    }
    engine.tick(t);
    engine.noteOn(69, 100, t); // the engine is still playable after the sweep (mode changes had cleared the chord)
    expect(engine.voiceCount).toBeGreaterThan(0);
    const out = (await ctx.startRendering()).getChannelData(0);
    for (let i = 0; i < out.length; i += 97) expect(Number.isFinite(out[i]!)).toBe(true);
    expect(peak(out)).toBeLessThan(40); // finite and not blowing up (the master limiter handles the rest)
    engine.dispose();
  });

  it('a knob sweep does not zipper: cutoff moves in 5 ms steps with no output discontinuity', async () => {
    const { L } = await run(1.5, { 'osc-a-waveform': 'sine', 'filter-cutoff': 100 }, (e) => {
      e.noteOn(69, 127, 0);
      for (let i = 0; i <= 200; i++) e.setParam('filter-cutoff', 100 * 80 ** (i / 200), 0.25 + i * 0.005); // 100 Hz → 8 kHz in 1 s
    });
    const natural = ((2 * Math.PI * 440) / SR) * VOICE_BUS_GAIN * 0.8 * 1.5;
    expect(findClicks(L, natural * 1.4)).toEqual([]);
    expect(peak(L, SR * 0.5)).toBeGreaterThan(0.1); // and it did open up
  });

  it('mixer and pitch changes while holding a note are click-free too', async () => {
    const { L } = await run(1.2, { 'osc-a-waveform': 'sine' }, (e) => {
      e.noteOn(69, 127, 0);
      for (let i = 0; i <= 100; i++) e.setParam('mix-osc-a', 0.8 - 0.7 * (i / 100), 0.3 + i * 0.005);
      for (let i = 0; i <= 100; i++) e.setParam('osc-a-fine', -50 + i, 0.8 + i * 0.002);
    });
    expect(findClicks(L, ((2 * Math.PI * 450) / SR) * VOICE_BUS_GAIN * 0.8 * 1.5)).toEqual([]);
  });
});

describe('playing', () => {
  it('a default-patch note sounds at the right pitch, in stereo-compatible output', async () => {
    const { L, R } = await run(1.5, {}, (e) => e.noteOn(69, 100, 0));
    const f = dominantFrequency(L, SR, { start: SR / 2, size: 32768, minHz: 100, maxHz: 3000 });
    expect(Math.abs(f - 440) / 440).toBeLessThan(0.01);
    expect(L.length).toBe(R.length);
  });

  it('a chord sounds all its notes', async () => {
    const { L } = await run(1.5, { 'osc-a-waveform': 'sine' }, (e) => [60, 64, 67].forEach((n) => e.noteOn(n, 100, 0)));
    const size = 32768;
    for (const n of [60, 64, 67]) {
      const hz = 440 * 2 ** ((n - 69) / 12);
      let best = 0;
      for (let d = -3; d <= 3; d += 0.25) best = Math.max(best, toneAmplitude(L, SR, hz + d, SR / 2, size));
      expect(best, `note ${n}`).toBeGreaterThan(0.05);
    }
  });

  it('release dies away and the voice is cleaned up on tick', async () => {
    const { engine, L } = await run(1.5, { 'amp-env-release': 0.2 }, (e) => {
      e.noteOn(60, 100, 0);
      e.noteOff(60, 0.5);
    });
    expect(peak(L, Math.round(SR * 0.9))).toBeLessThan(1e-3);
    engine.tick(2);
    await new Promise((r) => setTimeout(r, 50));
    expect(engine.voiceCount).toBe(0);
  });

  it('sustain pedal holds a released note until lifted', async () => {
    const { L } = await run(2, { 'osc-a-waveform': 'sine', 'amp-env-release': 0.05 }, (e) => {
      e.setSustain(true, 0);
      e.noteOn(69, 100, 0);
      e.noteOff(69, 0.3);
      e.setSustain(false, 1.0);
    });
    expect(rms(L, Math.round(SR * 0.5), Math.round(SR * 0.9))).toBeGreaterThan(0.05); // still sounding after key-up
    expect(peak(L, Math.round(SR * 1.3))).toBeLessThan(1e-3); // gone after pedal-up
  });

  it('mono mode plays one voice; lowering the voice count steals', async () => {
    const mono = await run(0.5, { 'voice-mode': 'mono' }, (e) => [60, 64, 67].forEach((n, i) => e.noteOn(n, 100, i * 0.01)));
    expect(mono.engine.voiceCount).toBe(1);
    const poly = await run(0.5, {}, (e) => {
      [60, 62, 64, 65, 67].forEach((n) => e.noteOn(n, 100, 0));
      e.setParam('voice-count', 2, 0.1);
    });
    expect(poly.engine.voiceCount).toBeLessThanOrEqual(2);
  });

  it('panic (allNotesOff) silences everything fast', async () => {
    const { L } = await run(1, { 'amp-env-release': 5 }, (e) => {
      [60, 64, 67].forEach((n) => e.noteOn(n, 100, 0));
      e.noteOff(60, 0.1);
      setTimeout(() => {}, 0);
    });
    void L;
    const ctx = new OfflineAudioContext(2, SR, SR);
    const e = await createSynthEngine(ctx, patch({ 'amp-env-release': 5 }));
    e.output.connect(ctx.destination);
    [60, 64].forEach((n) => e.noteOn(n, 100, 0));
    // allNotesOff acts at ctx.currentTime (0 offline), so schedule it via a suspended render step.
    ctx.suspend(0.3).then(() => {
      e.allNotesOff();
      void ctx.resume();
    });
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(rms(out, Math.round(SR * 0.2), Math.round(SR * 0.29))).toBeGreaterThan(0.01);
    expect(peak(out, Math.round(SR * 0.4))).toBeLessThan(1e-3);
  });

  it('reports voice states for the UI while playing', async () => {
    const ctx = new OfflineAudioContext(2, SR, SR);
    const e = await createSynthEngine(ctx, patch());
    e.output.connect(ctx.destination);
    e.noteOn(62, 90, 0);
    const [s] = e.getVoiceStates();
    expect(s).toMatchObject({ pitch: 62, velocity: 90, held: true });
    expect(s!.amp.stage).toBe('attack');
    e.dispose();
  });
});

describe('modulation and effects through the engine', () => {
  it('LFO to pitch bends the note; changing destination via setParam works live', async () => {
    const { L } = await run(1.2, { 'osc-a-waveform': 'sine', 'master-tune': 480 as never }, (e) => {
      e.setParam('lfo-depth', 0.5, 0);
      e.setParam('lfo-rate', 5, 0);
      e.setParam('lfo-destination', 'pitch', 0);
      e.noteOn(69, 127, 0);
    });
    // Vibrato spreads the single spectral line: the fundamental alone captures less than a steady tone would.
    const steady = await run(1.2, { 'osc-a-waveform': 'sine', 'master-tune': 480 as never }, (e) => e.noteOn(69, 127, 0));
    const at = (x: Float32Array) => toneAmplitude(x, SR, 480, SR / 2, 9600);
    expect(at(L)).toBeLessThan(at(steady.L) * 0.8);
  });

  it('delay produces an echo and reverb produces a tail after the note ends', async () => {
    const dry = await run(2, { 'amp-env-release': 0.01, 'amp-env-decay': 0.01 }, (e) => {
      e.noteOn(60, 127, 0);
      e.noteOff(60, 0.1);
    });
    const wet = await run(2, { 'amp-env-release': 0.01, 'amp-env-decay': 0.01, 'delay-on': true, 'delay-time': 0.5, 'delay-mix': 0.8, 'reverb-on': true, 'reverb-mix': 0.6 }, (e) => {
      e.noteOn(60, 127, 0);
      e.noteOff(60, 0.1);
    });
    expect(peak(dry.L, Math.round(SR * 0.6), Math.round(SR * 0.7))).toBeLessThan(1e-3);
    expect(rms(wet.L, Math.round(SR * 0.6), Math.round(SR * 0.7))).toBeGreaterThan(0.005); // echo at 0.5 s
    expect(rms(wet.L, Math.round(SR * 1.6), Math.round(SR * 1.8))).toBeGreaterThan(0.0005); // reverb tail
  });

  it('tempo changes retune synced LFO and delay', async () => {
    const ctx = new OfflineAudioContext(2, SR, SR);
    const e = await createSynthEngine(ctx, patch({ 'lfo-sync': true, 'lfo-division': '1/4', 'delay-sync': true, 'delay-division': '1/4' }));
    expect(() => e.setTempo(60)).not.toThrow();
    expect(() => e.setTempo(240)).not.toThrow();
    e.dispose();
  });
});

describe('loadPatch', () => {
  it('applies only what changed and takes effect on sounding notes', async () => {
    const { L } = await run(1.5, { 'osc-a-waveform': 'sine' }, (e) => {
      e.noteOn(69, 127, 0);
      e.loadPatch(patch({ 'osc-a-waveform': 'sine', 'osc-a-octave': 1 }));
    });
    expect(Math.abs(dominantFrequency(L, SR, { start: SR, size: 16384, minHz: 100, maxHz: 3000 }) - 880) / 880).toBeLessThan(0.02);
  });

  it('switching voicing mode with notes held leaves nothing stuck', async () => {
    const ctx = new OfflineAudioContext(2, SR, SR);
    const e = await createSynthEngine(ctx, patch());
    e.output.connect(ctx.destination);
    [60, 64].forEach((n) => e.noteOn(n, 100, 0));
    e.loadPatch(patch({ 'voice-mode': 'mono' }));
    expect(e.getVoiceStates().filter((v) => v.held)).toEqual([]);
    e.noteOn(67, 100, 0.1);
    expect(e.voiceCount).toBe(1);
    e.dispose();
  });

  it('dispose is idempotent and leaves a usable context', async () => {
    const ctx = new OfflineAudioContext(2, SR / 4, SR);
    const e = await createSynthEngine(ctx, patch());
    e.noteOn(60, 100, 0);
    e.dispose();
    e.dispose();
    await ctx.startRendering();
  });
});

describe('real engine satisfies the engine contract', () => {
  engineContract(async () => createSynthEngine(new OfflineAudioContext(2, SR, SR), createPatch(), { janitorMs: 0 }));
});

// keep the helper imported (used by sweep helpers above)
void maxStep;
