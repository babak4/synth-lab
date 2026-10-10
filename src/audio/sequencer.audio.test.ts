/**
 * Sequencer timing through a real OfflineAudioContext (plan T5.2). The scheduler is driven exactly as
 * in the app (a tick every 25 ms, 100 ms lookahead) but from `ctx.suspend()` callbacks, so the test is
 * deterministic and asserts on rendered samples, never wall-clock time.
 */
import { describe, expect, it } from 'vitest';
import { TrackEngines } from '@/app/track-engines';
import { createPatch } from '@/core/contracts/patch';
import { PPQ, createProject, createTrack, type Note, type Project } from '@/core/contracts/project';
import { secondsPerTick } from '@/core/transport';
import { createProjectStore, type ProjectStore } from '@/state/project-store';
import { rms } from './analysis';
import { createSynthEngine } from './engine';
import { Sequencer, START_LEAD_S } from './sequencer';
import { ManualTimer } from './timer';
import { WebTrackMixer } from './track-mixer';

const SR = 48000;
const BAR = PPQ * 4;
const STEP = 0.025;
const t = (tick: number, bpm = 120) => START_LEAD_S + tick * secondsPerTick(bpm);

/** A clean test voice: sine, instant attack, short release, no effects. */
const patch = createPatch('seq', {
  'osc-a-waveform': 'sine',
  'mix-osc-a': 1,
  'amp-env-attack': 0.001,
  'amp-env-sustain': 1,
  'amp-env-release': 0.01,
  'amp-env-velocity': 0,
  'filter-cutoff': 20000,
});

const note = (id: string, pitch: number, start: number, duration: number): Note => ({ id, pitch, start, duration, velocity: 100 });

function projectWith(notes: Note[], over: Partial<Project> = {}): Project {
  const p = createProject();
  return { ...p, tracks: [{ ...createTrack(0, patch), id: 'A', notes }], lengthBars: 16, loop: { enabled: false, startBar: 0, endBar: 16 }, ...over };
}

interface Session {
  store: ProjectStore;
  seq: Sequencer;
  ctx: OfflineAudioContext;
  /** Render `seconds`, ticking the scheduler every 25 ms; `at` hooks run just before the tick at/after a time. */
  render(seconds: number, at?: Record<number, () => void>): Promise<Float32Array>;
}

async function session(project: Project, o: { metronome?: boolean; seconds?: number } = {}): Promise<Session> {
  const ctx = new OfflineAudioContext(2, SR * (o.seconds ?? 40), SR);
  const master = new GainNode(ctx, { gain: 1 });
  master.connect(ctx.destination);
  const store = createProjectStore(project);
  const mixer = new WebTrackMixer(master);
  const engines = new TrackEngines(store, mixer, (p) => createSynthEngine(ctx, p, { janitorMs: 0 }));
  await engines.start();
  const seq = new Sequencer({
    context: ctx,
    destination: master,
    getProject: () => store.getState().project,
    getEngine: (id) => engines.get(id),
    isMetronomeOn: () => o.metronome ?? false,
    timer: new ManualTimer(),
  });
  return {
    store,
    seq,
    ctx,
    async render(seconds, at = {}) {
      const hooks = Object.entries(at).map(([time, fn]) => [Number(time), fn] as const).sort((a, b) => a[0] - b[0]);
      const step = (target: number) => {
        if (target >= seconds) return;
        void ctx.suspend(target).then(() => {
          while (hooks.length && hooks[0]![0] <= ctx.currentTime) hooks.shift()![1]();
          seq.tick();
          step(ctx.currentTime + STEP);
          void ctx.resume();
        });
      };
      step(STEP);
      return (await ctx.startRendering()).getChannelData(0);
    },
  };
}

/** Times at which the signal rises through 5% of its peak after a quiet gap. */
function onsets(x: Float32Array, minGapS = 0.03): number[] {
  const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const thr = peak * 0.05;
  const out: number[] = [];
  let quietSince = 0;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]!) > thr) {
      if ((i - quietSince) / SR >= minGapS || out.length === 0) out.push(i / SR);
      quietSince = i + 1;
    }
  }
  return out;
}

const win = (x: Float32Array, from: number, to: number) => x.subarray(Math.round(from * SR), Math.round(to * SR));

describe('Sequencer through an OfflineAudioContext', () => {
  it('16 bars of 1/16 notes at 120 BPM start within 1 ms of their targets', async () => {
    const notes = Array.from({ length: 256 }, (_, i) => note(`n${i}`, 69, i * 240, 120));
    const s = await session(projectWith(notes), { seconds: 34 });
    s.seq.start(0, false);
    const out = await s.render(33);
    const found = onsets(out);
    expect(found).toHaveLength(256);
    found.forEach((time, i) => expect(Math.abs(time - t(i * 240)), `note ${i}`).toBeLessThan(0.001));
  }, 60_000);

  it('a loop is seamless: notes spanning the loop end are cut and re-triggered, nothing doubled or missed', async () => {
    // Loop bars 1–2 (4 s per pass at 120 BPM), played from its start. 'long' starts 1.5 bars into the loop
    // and runs well past the loop end; 'outside' lies before the loop and must never sound.
    const notes = [note('first', 69, BAR, 480), note('long', 69, BAR + BAR * 1.5, BAR * 3), note('outside', 69, 0, 480)];
    const p = projectWith(notes, { loop: { enabled: true, startBar: 1, endBar: 3 } });
    const s = await session(p, { seconds: 16 });
    s.seq.start(BAR, false);
    const out = await s.render(15);
    const passStart = (n: number) => t(BAR * 2 * n);
    for (let pass = 0; pass < 3; pass++) {
      const from = passStart(pass) - 0.02;
      const found = onsets(win(out, from, from + 3.9), 0.02).map((x) => x + from);
      expect(found, `pass ${pass}`).toHaveLength(2);
      expect(Math.abs(found[0]! - passStart(pass)), `pass ${pass} first`).toBeLessThan(0.001);
      expect(Math.abs(found[1]! - t(BAR * 2 * pass + BAR * 1.5)), `pass ${pass} long`).toBeLessThan(0.001);
      // The long note is cut at the loop end: after the next pass's short note, silence until it starts again.
      expect(rms(win(out, passStart(pass + 1) + 0.3, passStart(pass + 1) + 2.95)), `pass ${pass} cut`).toBeLessThan(1e-4);
    }
    // Same level every pass: a double trigger would add up.
    const level = (pass: number) => rms(win(out, t(BAR * 2 * pass + BAR * 1.5) + 0.2, t(BAR * 2 * pass + BAR * 1.5) + 0.9));
    expect(level(1) / level(0)).toBeCloseTo(1, 1);
    expect(level(2) / level(0)).toBeCloseTo(1, 1);
  }, 60_000);

  it('a note added during playback sounds on time; a note deleted while sounding is released within the lookahead', async () => {
    const p = projectWith([note('long', 60, 0, BAR * 8)]);
    const s = await session(p, { seconds: 8 });
    s.seq.start(0, false);
    const add = () => {
      const track = s.store.getState().project.tracks[0]!;
      s.store.getState().loadProject({ ...s.store.getState().project, tracks: [{ ...track, notes: [...track.notes, note('added', 72, Math.round((3 - START_LEAD_S) / secondsPerTick(120)), 480)] }] });
    };
    const remove = () => {
      const track = s.store.getState().project.tracks[0]!;
      s.store.getState().loadProject({ ...s.store.getState().project, tracks: [{ ...track, notes: track.notes.filter((n) => n.id !== 'long') }] });
    };
    const out = await s.render(7.5, { 1: add, 2: remove });
    expect(rms(win(out, 1.5, 1.9))).toBeGreaterThan(0.01); // the long note is sounding
    expect(rms(win(out, 2.25, 2.9))).toBeLessThan(1e-4); // gone ~0.25 s after the delete (lookahead + release)
    const upper = onsets(win(out, 2.5, 4)).map((x) => x + 2.5);
    expect(Math.abs(upper[0]! - 3)).toBeLessThan(0.001); // the added note, 1 s after it was added
  }, 60_000);

  it('stop silences the sequencer notes at once and leaves nothing hanging', async () => {
    const s = await session(projectWith([note('long', 60, 0, BAR * 8), note('long2', 64, 0, BAR * 8)]), { seconds: 4 });
    s.seq.start(0, false);
    const out = await s.render(3.5, { 1: () => s.seq.stop() });
    expect(rms(win(out, 0.5, 0.9))).toBeGreaterThan(0.01);
    expect(rms(win(out, 1.15, 3.4))).toBeLessThan(1e-5);
    expect(s.seq.playing).toBe(false);
  }, 60_000);

  it('changing the tempo while playing changes the spacing of the notes not yet scheduled', async () => {
    const notes = Array.from({ length: 24 }, (_, i) => note(`n${i}`, 69, i * PPQ, 120));
    const s = await session(projectWith(notes), { seconds: 12 });
    s.seq.start(0, false);
    const out = await s.render(11, { 2: () => s.store.getState().setTempo(240) });
    const found = onsets(out);
    expect(found).toHaveLength(24);
    const gaps = found.slice(1).map((x, i) => x - found[i]!);
    expect(gaps.slice(0, 3).every((g) => Math.abs(g - 0.5) < 0.001)).toBe(true);
    expect(gaps.slice(-8).every((g) => Math.abs(g - 0.25) < 0.001)).toBe(true);
  }, 60_000);

  it('muting a track through the project silences its sequenced notes', async () => {
    const s = await session(projectWith([note('long', 60, 0, BAR * 4)]), { seconds: 4 });
    s.seq.start(0, false);
    const out = await s.render(3.5, { 1: () => s.store.getState().setTrackMute('A', true) });
    expect(rms(win(out, 0.4, 0.9))).toBeGreaterThan(0.01);
    expect(rms(win(out, 1.3, 3.4))).toBeLessThan(1e-5);
  }, 60_000);

  it('metronome: accented downbeat louder than the other beats, clicks on the beat, one-bar count-in first', async () => {
    const s = await session(projectWith([note('n', 69, 0, 240)], { lengthBars: 2 }), { metronome: true, seconds: 8 });
    s.seq.start(0, true);
    const out = await s.render(7);
    // Count-in bar (4 clicks, 2 s), then 2 bars of song with clicks each beat, and the note on the first beat.
    const clicks = onsets(out, 0.1);
    expect(clicks.length).toBeGreaterThanOrEqual(12);
    clicks.slice(0, 12).forEach((time, i) => expect(Math.abs(time - (START_LEAD_S + i * 0.5)), `click ${i}`).toBeLessThan(0.001));
    const peakAt = (time: number) => win(out, time, time + 0.03).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peakAt(START_LEAD_S)).toBeGreaterThan(peakAt(START_LEAD_S + 0.5) * 1.3); // accent
    expect(peakAt(START_LEAD_S + 2)).toBeGreaterThan(peakAt(START_LEAD_S + 2.5) * 1.3); // bar 1 downbeat
  }, 60_000);
});
