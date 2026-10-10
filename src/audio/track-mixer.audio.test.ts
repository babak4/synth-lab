import { describe, expect, it } from 'vitest';
import { createPatch } from '@/core/contracts/patch';
import { peak, rms } from './analysis';
import { createSynthEngine } from './engine';
import { ReverbHub } from './effects/reverb-hub';
import { WebTrackMixer } from './track-mixer';

const SR = 48000;

/** Two tracks sharing one reverb hub, each holding a note for the whole render. */
async function session(seconds: number, setup: (m: WebTrackMixer, ctx: OfflineAudioContext) => void) {
  const ctx = new OfflineAudioContext(2, Math.round(SR * seconds), SR);
  const master = new GainNode(ctx, { gain: 1 });
  master.connect(ctx.destination);
  const hub = new ReverbHub(ctx, master);
  const mixer = new WebTrackMixer(master);
  const patch = createPatch('t', { 'reverb-on': false });
  const a = await createSynthEngine(ctx, patch, { janitorMs: 0, reverbHub: hub });
  const b = await createSynthEngine(ctx, patch, { janitorMs: 0, reverbHub: hub });
  mixer.addTrack('a', a);
  mixer.addTrack('b', b);
  a.noteOn(57, 100, 0);
  b.noteOn(64, 100, 0);
  setup(mixer, ctx);
  const out = (await ctx.startRendering()).getChannelData(0);
  return { out, a, b, mixer };
}

const settled = (out: Float32Array) => out.subarray(Math.round(SR * 0.3));

describe('WebTrackMixer', () => {
  it('sums the tracks; mute removes one; solo leaves only the soloed track', async () => {
    const both = rms(settled((await session(1, () => {})).out));
    const muteA = rms(settled((await session(1, (m) => m.setMute('a', true))).out));
    const soloB = rms(settled((await session(1, (m) => m.setSolo('b', true))).out));
    const soloA = rms(settled((await session(1, (m) => m.setSolo('a', true))).out));
    expect(both).toBeGreaterThan(muteA * 1.1);
    expect(muteA).toBeCloseTo(soloB, 3); // "mute A" and "solo B" are the same mix with two tracks
    expect(both).toBeGreaterThan(soloA * 1.1);
  });

  it('the fader scales a track: −6 dB is about half the amplitude, −60 dB is silent', async () => {
    const only = (db: number) => session(1, (m) => (m.setMute('b', true), m.setVolumeDb('a', db)));
    const full = rms(settled((await only(0)).out));
    const half = rms(settled((await only(-6)).out));
    expect(half / full).toBeCloseTo(0.5, 1);
    expect(peak(settled((await only(-60)).out))).toBe(0); // after the ~15 ms ramp down
  });

  it('removing a playing track silences and disposes it, and the others keep sounding', async () => {
    let removedAt = 0;
    const { out, a, mixer } = await session(1, (m, ctx) => {
      void ctx.suspend(0.5).then(() => {
        m.removeTrack('a');
        removedAt = ctx.currentTime;
        void ctx.resume();
      });
    });
    expect(removedAt).toBeGreaterThanOrEqual(0.5);
    expect(mixer.has('a')).toBe(false);
    expect(mixer.trackIds).toEqual(['b']);
    // After the removal, 'b' alone is still audible...
    expect(rms(out.subarray(Math.round(SR * 0.7)))).toBeGreaterThan(0.001);
    // ...and 'a' makes no more sound: it is the same as a render where it never played after 0.5 s.
    const bOnly = await session(1, (m) => m.removeTrack('a'));
    expect(rms(out.subarray(Math.round(SR * 0.7)))).toBeCloseTo(rms(bOnly.out.subarray(Math.round(SR * 0.7))), 3);
    // The engine refuses further work after dispose (no hanging voices).
    a.noteOn(60, 100);
    expect(a.voiceCount).toBe(0);
  });

  it('removing a soloed track releases the others', async () => {
    const { out } = await session(1, (m) => {
      m.setSolo('a', true);
      m.removeTrack('a');
    });
    expect(rms(settled(out))).toBeGreaterThan(0.001); // b is audible again
  });

  it('refuses the same track twice, and dispose empties the mixer', async () => {
    const { mixer, b } = await session(0.2, () => {});
    expect(() => mixer.addTrack('b', b)).toThrow();
    mixer.dispose();
    expect(mixer.trackIds).toEqual([]);
  });
});
