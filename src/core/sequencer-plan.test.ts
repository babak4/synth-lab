import { describe, expect, it } from 'vitest';
import { PPQ, createProject, createTrack, type Note, type Project } from './contracts/project';
import { SequencerPlan, type PlanEvent } from './sequencer-plan';
import { secondsPerTick } from './transport';

const BAR = PPQ * 4;
const STEP = 0.025;
const LOOKAHEAD = 0.1;

const note = (id: string, pitch: number, start: number, duration: number, velocity = 100): Note => ({ id, pitch, start, duration, velocity });

function project(notes: Note[], over: Partial<Project> = {}): Project {
  const p = createProject();
  const t = { ...createTrack(0), id: 'A', notes };
  return { ...p, tracks: [t], lengthBars: 16, loop: { enabled: false, startBar: 0, endBar: 16 }, ...over };
}

interface RunOpts {
  until: number;
  metronome?: boolean;
  /** Called before each scheduling pass; return a replacement project to edit it. */
  each?: (now: number, p: Project) => Project | undefined;
  step?: (i: number) => number;
}

/** Simulate the audio-layer timer: call advance every STEP with a LOOKAHEAD horizon. */
function run(plan: SequencerPlan, p0: Project, o: RunOpts, t0 = 0): { events: PlanEvent[]; project: Project } {
  const events: PlanEvent[] = [];
  let p = p0;
  let now = t0;
  for (let i = 0; now <= o.until && !plan.ended; i++) {
    p = o.each?.(now, p) ?? p;
    events.push(...plan.advance(now + LOOKAHEAD, now, p, o.metronome ?? false));
    now += o.step ? o.step(i) : STEP;
  }
  return { events, project: p };
}

const ons = (e: PlanEvent[]) => e.filter((x): x is Extract<PlanEvent, { kind: 'noteOn' }> => x.kind === 'noteOn');
const offs = (e: PlanEvent[]) => e.filter((x): x is Extract<PlanEvent, { kind: 'noteOff' }> => x.kind === 'noteOff');
const clicks = (e: PlanEvent[]) => e.filter((x): x is Extract<PlanEvent, { kind: 'click' }> => x.kind === 'click');
const at = (tick: number, bpm = 120, t0 = 0) => t0 + tick * secondsPerTick(bpm);
const mk = (p: Project, o: { fromTick?: number; startTime?: number; countIn?: number } = {}) =>
  new SequencerPlan({ fromTick: o.fromTick ?? 0, startTime: o.startTime ?? 0, countInTicks: o.countIn ?? 0, tempo: p.tempo });

describe('timing', () => {
  it('16 bars of 1/16 notes at 120 BPM land on their exact times', () => {
    const notes = Array.from({ length: 256 }, (_, i) => note(`n${i}`, 60 + (i % 12), i * 240, 120));
    const p = project(notes);
    const { events } = run(mk(p, { startTime: 0.05 }), p, { until: 40 });
    const on = ons(events);
    expect(on).toHaveLength(256);
    on.forEach((e, i) => expect(Math.abs(e.time - at(i * 240, 120, 0.05))).toBeLessThan(1e-9));
    const off = offs(events);
    expect(off).toHaveLength(256);
    off.forEach((e, i) => expect(Math.abs(e.time - at(i * 240 + 120, 120, 0.05))).toBeLessThan(1e-9));
  });

  it('every note triggers exactly once whatever the timer jitter', () => {
    const notes = Array.from({ length: 200 }, (_, i) => note(`n${i}`, 40 + (i % 40), i * 77, 60));
    const p = project(notes);
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    // Steps between 1 ms and 95 ms: the timer may be late, but never later than the lookahead.
    const { events } = run(mk(p), p, { until: 30, step: () => 0.001 + rnd() * 0.094 });
    expect(ons(events).map((e) => e.noteId).sort()).toEqual(notes.map((n) => n.id).sort());
    expect(offs(events)).toHaveLength(200);
  });

  it('count-in: one bar of accented clicks, notes start when it ends', () => {
    const p = project([note('a', 60, 0, 480)]);
    const plan = mk(p, { startTime: 1, countIn: BAR });
    const { events } = run(plan, p, { until: 6, metronome: true }, 0.9);
    const c = clicks(events).filter((e) => e.time < 3);
    expect(c.map((e) => +(e.time - 1).toFixed(6))).toEqual([0, 0.5, 1, 1.5]);
    expect(c.map((e) => e.accent)).toEqual([true, false, false, false]);
    expect(ons(events)[0]!.time).toBeCloseTo(3, 9);
    expect(plan.positionAt(1.5).countIn).toBe(true);
    expect(plan.positionAt(3.25).countIn).toBe(false);
    expect(plan.positionAt(3.5).tick).toBeCloseTo(PPQ, 6);
  });

  it('metronome accents the downbeat; 6/8 clicks twice a bar', () => {
    const p = project([], { lengthBars: 2 });
    const { events } = run(mk(p), p, { until: 6, metronome: true });
    expect(clicks(events).map((e) => e.accent)).toEqual([true, false, false, false, true, false, false, false]);
    const p68 = project([], { lengthBars: 2, timeSignature: { numerator: 6, denominator: 8 } });
    const r = run(mk(p68), p68, { until: 6, metronome: true });
    expect(clicks(r.events).map((e) => e.accent)).toEqual([true, false, true, false]);
  });

  it('the count-in clicks even with the metronome off; only the song clicks follow the switch', () => {
    const p = project([note('a', 60, 0, 480)], { lengthBars: 2 });
    const { events } = run(mk(p, { countIn: BAR }), p, { until: 8, metronome: false });
    expect(clicks(events).map((e) => e.accent)).toEqual([true, false, false, false]);
    expect(Math.max(...clicks(events).map((e) => e.time))).toBeLessThan(2);
    expect(ons(events)[0]!.time).toBeCloseTo(2, 9);
  });

  it('metronome off schedules no clicks', () => {
    const p = project([], { lengthBars: 2 });
    expect(clicks(run(mk(p), p, { until: 6 }).events)).toHaveLength(0);
  });

  it('starting mid-song plays from there and does not chase notes already sounding', () => {
    const p = project([note('a', 60, 0, BAR * 4), note('b', 62, BAR * 2, 480), note('c', 64, BAR * 2 + 960, 480)]);
    const { events } = run(mk(p, { fromTick: BAR * 2 + 100, startTime: 0 }), p, { until: 10 });
    expect(ons(events).map((e) => e.noteId)).toEqual(['c']);
    expect(ons(events)[0]!.time).toBeCloseTo(at(860), 9);
  });

  it('ends at the song end and releases what is still sounding', () => {
    const p = project([note('a', 60, BAR * 2 - 240, BAR)], { lengthBars: 2 });
    const plan = mk(p);
    const { events } = run(plan, p, { until: 20 });
    expect(plan.ended).toBe(true);
    expect(offs(events)[0]!.time).toBeCloseTo(at(BAR * 2), 9);
    expect(plan.endTime).toBeCloseTo(at(BAR * 2), 9);
    expect(plan.positionAt(100).tick).toBe(BAR * 2);
    expect(plan.activeCount).toBe(0);
  });
});

describe('looping', () => {
  const loop = { enabled: true, startBar: 1, endBar: 3 };
  const loopLen = BAR * 2;
  const passSeconds = 4; // 2 bars at 120 BPM

  it('wraps seamlessly: every pass plays the same notes at exactly one loop length apart', () => {
    const p = project([note('in1', 60, BAR, 480), note('in2', 62, BAR * 2 + 960, 480), note('out', 64, 0, 480), note('late', 65, BAR * 3, 480)], { loop });
    const { events } = run(mk(p, { fromTick: BAR }), p, { until: 4 * passSeconds + 0.5 });
    const byNote = (id: string) => ons(events).filter((e) => e.noteId === id).map((e) => e.time);
    expect(byNote('out')).toHaveLength(0);
    expect(byNote('late')).toHaveLength(0);
    const a = byNote('in1');
    expect(a.length).toBeGreaterThanOrEqual(4);
    a.forEach((t, k) => expect(Math.abs(t - at(loopLen * k))).toBeLessThan(1e-9));
    byNote('in2').forEach((t, k) => expect(Math.abs(t - at(960 + BAR + loopLen * k))).toBeLessThan(1e-9));
  });

  it('a note that spans the loop end is cut there and re-triggered on the next pass', () => {
    const p = project([note('long', 67, BAR * 2 + 960, BAR * 2)], { loop });
    const { events } = run(mk(p, { fromTick: BAR }), p, { until: 13 });
    const on = ons(events);
    const off = offs(events);
    expect(on.length).toBeGreaterThanOrEqual(3);
    // Cut exactly at the loop end (one loop length after the start position, then every pass).
    off.slice(0, 3).forEach((e, k) => expect(Math.abs(e.time - at(loopLen + loopLen * k))).toBeLessThan(1e-9));
    on.slice(0, 3).forEach((e, k) => expect(Math.abs(e.time - at(BAR + 960 + loopLen * k))).toBeLessThan(1e-9));
    // Strictly alternating on/off: nothing double-triggered, nothing stuck.
    const seq = [...on, ...off].sort((a, b) => a.time - b.time || (a.kind === 'noteOff' ? -1 : 1)).map((e) => e.kind);
    seq.forEach((k, i) => expect(k).toBe(i % 2 === 0 ? 'noteOn' : 'noteOff'));
  });

  it('a note at the very start and one ending at the very end of the loop are neither doubled nor missed', () => {
    const p = project([note('first', 60, BAR, 480), note('last', 62, BAR * 3 - 480, 480)], { loop });
    const { events } = run(mk(p, { fromTick: BAR }), p, { until: 12.5 });
    const first = ons(events).filter((e) => e.noteId === 'first').map((e) => e.time);
    const last = ons(events).filter((e) => e.noteId === 'last').map((e) => e.time);
    first.forEach((t, k) => expect(Math.abs(t - k * passSeconds)).toBeLessThan(1e-9));
    last.forEach((t, k) => expect(Math.abs(t - (passSeconds - 0.25 + k * passSeconds))).toBeLessThan(1e-9));
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(last.length).toBeGreaterThanOrEqual(3);
    const lastOffs = offs(events).filter((e) => e.noteId === 'last').map((e) => e.time);
    last.forEach((t, k) => expect(Math.abs(lastOffs[k]! - (t + 0.25))).toBeLessThan(1e-9));
  });

  it('plays on to the loop end from before the loop, then wraps', () => {
    const p = project([note('x', 60, 0, 240), note('y', 61, BAR, 240)], { loop });
    const { events } = run(mk(p), p, { until: 10 });
    expect(ons(events).map((e) => e.noteId)).toEqual(['x', 'y', 'y', 'y']);
  });

  it('positions wrap with the loop', () => {
    const p = project([], { loop });
    const plan = mk(p, { fromTick: BAR });
    run(plan, p, { until: 3.9 });
    expect(plan.positionAt(1).tick).toBeCloseTo(BAR + 2 * PPQ, 6);
    expect(plan.positionAt(3.999).tick).toBeLessThan(BAR * 3);
    expect(plan.positionAt(3.999).tick).toBeGreaterThan(BAR * 3 - 20);
    expect(plan.positionAt(4.5).tick).toBeCloseTo(BAR + PPQ, 6);
  });

  it('the playhead read at the heard time (behind the clock) never leaves the loop after a wrap', () => {
    const p = project([], { loop });
    const plan = mk(p, { fromTick: BAR });
    const lat = 0.3;
    let checked = 0;
    run(plan, p, {
      until: 20,
      each: (now) => {
        if (now > lat + 0.2) {
          const tick = plan.positionAt(now - lat).tick;
          expect(tick, `at ${now}`).toBeGreaterThanOrEqual(BAR - 1e-6);
          expect(tick).toBeLessThanOrEqual(BAR * 3 + 1e-6);
          checked++;
        }
        return undefined;
      },
    });
    expect(checked).toBeGreaterThan(500);
  });

  it('a loop edited so that its end is behind the playhead wraps at once, and playback goes on', () => {
    const p = project([note('a', 60, 0, 240)], { lengthBars: 4, loop: { enabled: true, startBar: 0, endBar: 4 } });
    const plan = mk(p);
    let edited = false;
    const ticks: number[] = [];
    const { events } = run(plan, p, {
      until: 12,
      each: (now, q) => {
        ticks.push(plan.positionAt(now).tick);
        if (now < 5 || edited) return undefined;
        edited = true; // 2.5 bars in
        return { ...q, loop: { enabled: true, startBar: 0, endBar: 1 } };
      },
    });
    expect(plan.ended).toBe(false);
    expect(Math.max(...ticks.slice(ticks.findIndex((_, i) => i * STEP > 5.3)))).toBeLessThan(BAR + 1);
    // Bar 0's note keeps coming round: once at the start, then every 2 s after the edit.
    expect(ons(events).length).toBeGreaterThanOrEqual(4);
    expect(plan.activeCount).toBeLessThanOrEqual(1);
  });

  it('starting past the loop end with the loop on plays on to the song end', () => {
    const p = project([], { lengthBars: 4, loop: { enabled: true, startBar: 0, endBar: 1 } });
    const plan = mk(p, { fromTick: BAR * 2 });
    run(plan, p, { until: 10 });
    expect(plan.ended).toBe(true);
    expect(plan.endTime).toBeCloseTo(at(BAR * 2), 9);
  });

  it('turning the loop on and off while playing', () => {
    const p = project([note('a', 60, 0, 240), note('b', 61, BAR * 2, 240)], { lengthBars: 4 });
    const { events } = run(mk(p), p, {
      until: 14,
      each: (now, q) =>
        now > 0.2 && now < 0.3 ? { ...q, loop: { enabled: true, startBar: 0, endBar: 1 } } : now >= 6 && q.loop.enabled ? { ...q, loop: { ...q.loop, enabled: false } } : undefined,
    });
    expect(ons(events).filter((e) => e.noteId === 'a').length).toBeGreaterThan(2);
    expect(ons(events).filter((e) => e.noteId === 'b')).toHaveLength(1);
  });

  it('30 minutes of looping shows no drift and no lost or doubled notes', () => {
    for (const bpm of [120, 137.3, 63]) {
      const notes = [note('a', 60, BAR, 240), note('b', 64, BAR + 1920, 7000), note('c', 67, BAR * 3 - 1, 1)];
      const p = project(notes, { loop, tempo: bpm });
      const plan = new SequencerPlan({ fromTick: BAR, startTime: 0.05, countInTicks: 0, tempo: bpm });
      const events: PlanEvent[] = [];
      const end = 30 * 60;
      for (let i = 0; i * STEP < end; i++) {
        const now = i * STEP;
        events.push(...plan.advance(now + LOOKAHEAD, now, p, false));
      }
      const passes = ons(events).filter((e) => e.noteId === 'a');
      expect(passes.length).toBeGreaterThan((end / ((loopLen * 60) / (bpm * PPQ))) * 0.99);
      passes.forEach((e, k) => {
        const exact = 0.05 + (loopLen * k * 60) / (bpm * PPQ);
        expect(Math.abs(e.time - exact)).toBeLessThan(1e-9);
      });
      // Every pass has one of each note, and every on has its off (at most the last pass still open).
      for (const id of ['b', 'c']) expect(Math.abs(ons(events).filter((e) => e.noteId === id).length - passes.length)).toBeLessThanOrEqual(1);
      expect(ons(events).length - offs(events).length).toBeGreaterThanOrEqual(0);
      expect(ons(events).length - offs(events).length).toBeLessThanOrEqual(3);
      expect(plan.activeCount).toBeLessThanOrEqual(3);
    }
  });
});

describe('live edits', () => {
  it('a note added ahead of the playhead plays; one added inside the scheduled window is caught up once', () => {
    let p = project([]);
    const plan = mk(p, { startTime: 0 });
    const events: PlanEvent[] = [];
    for (let now = 0; now < 3; now += STEP) {
      if (Math.abs(now - 1) < 1e-9) {
        p = { ...p, tracks: [{ ...p.tracks[0]!, notes: [note('ahead', 60, 3000, 240), note('window', 62, Math.round(1.06 / secondsPerTick(120)), 240)] }] };
      }
      events.push(...plan.advance(now + LOOKAHEAD, now, p, false));
    }
    const win = ons(events).filter((e) => e.noteId === 'window');
    expect(win).toHaveLength(1);
    expect(win[0]!.time).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(Math.abs(win[0]!.time - 1.06)).toBeLessThan(1e-3);
    const ahead = ons(events).filter((e) => e.noteId === 'ahead');
    expect(ahead).toHaveLength(1);
    expect(ahead[0]!.time).toBeCloseTo(at(3000), 9);
  });

  it('a note deleted while sounding is released at once; a track deleted likewise', () => {
    for (const mode of ['note', 'track'] as const) {
      const p0 = project([note('a', 60, 0, BAR * 4), note('b', 64, 0, BAR * 4)]);
      const plan = mk(p0);
      const { events } = run(plan, p0, {
        until: 2,
        each: (now, p) => (now >= 1 ? (mode === 'note' ? { ...p, tracks: [{ ...p.tracks[0]!, notes: [] }] } : { ...p, tracks: [] }) : undefined),
      });
      expect(offs(events)).toHaveLength(2);
      for (const o of offs(events)) {
        expect(o.time).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(o.time).toBeLessThan(1.1);
      }
      expect(plan.activeCount).toBe(0);
    }
  });

  it('shortening a sounding note ends it; lengthening extends it', () => {
    const p0 = project([note('a', 60, 0, BAR * 4), note('b', 62, 0, 960)]);
    let edited = false;
    const { events } = run(mk(p0), p0, {
      until: 6,
      each: (now, p) => {
        if (now < 0.2 || edited) return undefined;
        edited = true;
        return { ...p, tracks: [{ ...p.tracks[0]!, notes: [note('a', 60, 0, 3 * PPQ), note('b', 62, 0, 4 * PPQ)] }] };
      },
    });
    const off = (id: string) => offs(events).find((e) => e.noteId === id)!.time;
    expect(off('a')).toBeCloseTo(at(3 * PPQ), 9); // 1.5 s
    expect(off('b')).toBeCloseTo(at(4 * PPQ), 9); // 2 s: it was due at 0.5 s but was lengthened first
  });

  it('a note shortened to end in the past releases immediately, never before it started', () => {
    const p0 = project([note('a', 60, 3000, BAR)]);
    const { events } = run(mk(p0), p0, {
      until: 6,
      each: (now, p) => (now >= 2 ? { ...p, tracks: [{ ...p.tracks[0]!, notes: [note('a', 60, 3000, 10)] }] } : undefined),
    });
    expect(offs(events)).toHaveLength(1);
    expect(offs(events)[0]!.time).toBeGreaterThanOrEqual(2 - 1e-9);
    expect(offs(events)[0]!.time).toBeGreaterThan(ons(events)[0]!.time);
  });

  it('same pitch back to back on a track retriggers with off before on', () => {
    const p = project([note('a', 60, 0, 960), note('b', 60, 480, 480)]);
    const { events } = run(mk(p), p, { until: 3 });
    const seq = events.map((e) => (e.kind === 'noteOn' ? `on:${e.noteId}` : e.kind === 'noteOff' ? `off:${e.noteId}` : 'click'));
    expect(seq).toEqual(['on:a', 'off:a', 'on:b', 'off:b']);
    expect(events[1]!.time).toBeCloseTo(events[2]!.time, 12);
  });

  it('fuzz: any sequence of edits leaves nothing stuck and never double-triggers a pitch', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let s = seed * 9973;
      const rnd = (n: number) => (s = (s * 1103515245 + 12345) & 0x7fffffff) % n;
      let p = project([], { lengthBars: 4, loop: { enabled: true, startBar: 0, endBar: 2 } });
      const plan = mk(p);
      const events: PlanEvent[] = [];
      let id = 0;
      for (let i = 0; i * STEP < 20; i++) {
        const now = i * STEP;
        if (rnd(3) === 0) {
          const notes = [...p.tracks[0]!.notes];
          const action = rnd(5);
          if (action <= 1 || notes.length === 0) notes.push(note(`n${id++}`, 55 + rnd(4), rnd(BAR * 4 - 100), 1 + rnd(BAR)));
          else if (action === 2) notes.splice(rnd(notes.length), 1);
          else {
            const k = rnd(notes.length);
            notes[k] = action === 3 ? { ...notes[k]!, duration: 1 + rnd(2000) } : { ...notes[k]!, start: rnd(BAR * 4 - 100) };
          }
          p = { ...p, tracks: [{ ...p.tracks[0]!, notes }] };
          if (rnd(20) === 0) p = { ...p, tempo: 60 + rnd(120) };
          if (rnd(30) === 0) p = { ...p, loop: { ...p.loop, enabled: !p.loop.enabled } };
        }
        events.push(...plan.advance(now + LOOKAHEAD, now, p, false));
      }
      // Let it run out with the loop off: everything must end up released.
      p = { ...p, loop: { ...p.loop, enabled: false } };
      for (let now = 20, i = 0; !plan.ended && i < 4000; i++, now += STEP) events.push(...plan.advance(now + LOOKAHEAD, now, p, false));
      expect(plan.ended).toBe(true);
      expect(plan.activeCount).toBe(0);
      // In dispatch order the stream per pitch alternates on/off, and a release is never earlier than its attack.
      const state = new Map<number, number | null>();
      for (const e of events) {
        if (e.kind === 'click') continue;
        const onTime = state.get(e.pitch) ?? null;
        if (e.kind === 'noteOn') {
          expect(onTime, `seed ${seed}: double on ${e.pitch} at ${e.time}`).toBeNull();
          state.set(e.pitch, e.time);
        } else {
          expect(onTime, `seed ${seed}: stray off ${e.pitch} at ${e.time}`).not.toBeNull();
          expect(e.time).toBeGreaterThanOrEqual(onTime!);
          state.set(e.pitch, null);
        }
      }
      for (const v of state.values()) expect(v).toBeNull();
    }
  });
});

describe('tempo change while playing', () => {
  it('takes effect from the first unscheduled event, with a continuous timeline', () => {
    const notes = Array.from({ length: 40 }, (_, i) => note(`n${i}`, 60, i * PPQ, 100));
    const p = project(notes);
    const plan = mk(p);
    const samples: { t: number; tick: number }[] = [];
    const { events } = run(plan, p, {
      until: 30,
      each: (now, q) => {
        samples.push({ t: now, tick: plan.positionAt(now).tick });
        return now >= 4 ? { ...q, tempo: 240 } : undefined;
      },
    });
    const t = ons(events).map((e) => e.time);
    expect(t).toHaveLength(40);
    // Spacing is 0.5 s at 120 BPM and 0.25 s at 240: one blended gap at the change, no gap or overlap.
    const gaps = t.slice(1).map((x, i) => +(x - t[i]!).toFixed(9));
    const change = gaps.findIndex((g) => g !== 0.5);
    expect(change).toBeGreaterThan(6); // events inside the 100 ms lookahead keep the old tempo
    expect(change).toBeLessThan(10);
    expect(gaps[change]!).toBeGreaterThanOrEqual(0.25);
    expect(gaps[change]!).toBeLessThanOrEqual(0.5);
    expect(gaps.slice(change + 1).every((g) => g === 0.25)).toBe(true);
    // The reported position is monotonic and consistent with the note times on both sides of the change.
    for (let i = 1; i < samples.length; i++) expect(samples[i]!.tick).toBeGreaterThanOrEqual(samples[i - 1]!.tick);
    const near = (time: number) => samples.find((x) => x.t >= time)!;
    expect(near(t[2]!).tick).toBeGreaterThan(2 * PPQ - 60);
    expect(near(t[2]!).tick).toBeLessThan(2 * PPQ + 60 + 0.025 * 1920);
    const late = near(t[30]! + 0.01);
    expect(Math.abs(late.tick - (30 * PPQ + (late.t - t[30]!) * 3840))).toBeLessThan(3840 * 0.03);
  });

  it('repeated tempo changes keep the position moving forward between loop wraps', () => {
    const p0 = project([], { loop: { enabled: true, startBar: 0, endBar: 2 } });
    const plan = mk(p0);
    let last = -1;
    let wraps = 0;
    run(plan, p0, {
      until: 20,
      each: (now, q) => {
        const tick = plan.positionAt(now).tick;
        if (tick < last) {
          wraps++;
          expect(last).toBeGreaterThan(BAR * 2 - PPQ / 2); // only a loop wrap may go backwards
        }
        last = tick;
        return { ...q, tempo: 80 + ((Math.floor(now * 3) * 7) % 120) };
      },
    });
    expect(wraps).toBeGreaterThan(1);
  });
});
