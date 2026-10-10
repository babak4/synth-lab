/**
 * Sequencer plan (plan T5.2): the pure half of the lookahead scheduler.
 *
 * `SequencerPlan.advance(horizon, ...)` is called every ~25 ms with a horizon ~100 ms ahead of the audio
 * clock. It reads the project as it is *now* and returns the note-on, note-off and metronome events
 * whose audio time falls before the horizon, each exactly once. The audio layer only has to hand them
 * to the engines. Because everything is computed here from integer ticks it is unit-tested in Node,
 * including 30 simulated minutes of looping.
 *
 * Model
 *  - `u` is the *unwrapped* tick: it counts up forever from the start of the count-in (u = -countIn),
 *    through u = 0 (the start position), across every loop wrap. The song tick is `u + offset`, where the
 *    offset changes at each wrap. Audio time is `anchor.time + (u - anchor.u) * secondsPerTick`, where the
 *    anchor changes only when the tempo does. Both mappings are a single multiplication from an exact
 *    anchor, so no error accumulates however long the loop runs.
 *  - Notes trigger only at their start tick ("no chasing"): starting in the middle of a note, or
 *    wrapping to a loop start that lies inside a note, does not play that note. A note that runs past the
 *    loop end is cut at the loop end and plays again from its start on the next pass.
 *  - Note-offs are decided at the moment they fall inside the window, from the note's *current*
 *    duration, so shortening, moving or deleting a sounding note releases it. A note added at or ahead of
 *    the playhead (even inside the already-scheduled window) is picked up by the next call; a note that
 *    has disappeared is released immediately. Nothing can be left sounding.
 *  - A loop edited so its end lies behind the playhead wraps to its start at once. Starting playback past
 *    the loop end plays on to the song end instead (the start position is respected).
 *  - A tempo change takes effect from the first event not yet scheduled, so the timeline stays continuous.
 */
import type { LoopRegion, Note, TimeSignature } from './contracts/project';
import { ticksPerBar } from './contracts/project';
import { clickTicks, loopTicks, secondsPerTick, songEndTick } from './transport';

export interface PlanTrack {
  id: string;
  notes: readonly Note[];
}

/** The slice of a Project the plan reads. A `Project` satisfies this. */
export interface PlanProject {
  tempo: number;
  timeSignature: TimeSignature;
  lengthBars: number;
  loop: LoopRegion;
  tracks: readonly PlanTrack[];
}

export type PlanEvent =
  | { kind: 'noteOn'; time: number; trackId: string; noteId: string; pitch: number; velocity: number }
  | { kind: 'noteOff'; time: number; trackId: string; noteId: string; pitch: number }
  | { kind: 'click'; time: number; accent: boolean };

export interface PlanStart {
  /** Song tick to start from. */
  fromTick: number;
  /** Audio-clock time of the start (of the count-in, if any). */
  startTime: number;
  /** Ticks of count-in before `fromTick` (0 for none). */
  countInTicks: number;
  tempo: number;
}

export interface PlanPosition {
  /** Song tick (fractional). During the count-in this is the start position. */
  tick: number;
  countIn: boolean;
  ended: boolean;
}

interface TempoAnchor {
  u: number;
  time: number;
  bpm: number;
}
interface WrapAnchor {
  u: number;
  /** song tick = u + offset, from `u` on. */
  offset: number;
}
interface Active {
  trackId: string;
  noteId: string;
  pitch: number;
  onU: number;
  onTime: number;
}

/** How far behind the audio clock `positionAt` may be asked (covers any plausible output latency). */
export const PRUNE_GRACE_S = 0.5;

export class SequencerPlan {
  private readonly tempos: TempoAnchor[];
  private readonly wraps: WrapAnchor[];
  private cursorU: number;
  private readonly active = new Map<string, Active>();
  /** Notes triggered recently (key → unwrapped tick), so a late-added note is caught up exactly once. */
  private readonly fired = new Map<string, number>();
  private isEnded = false;
  /** The last slice was heading for a loop end (so a loop edited behind the playhead wraps at once). */
  private inLoop = false;
  private endAt = 0;
  private endSong = 0;
  private readonly fromTick: number;

  constructor(start: PlanStart) {
    this.fromTick = start.fromTick;
    const u0 = -start.countInTicks;
    this.cursorU = u0;
    this.tempos = [{ u: u0, time: start.startTime, bpm: start.tempo }];
    this.wraps = [{ u: u0, offset: start.fromTick }];
  }

  get ended(): boolean {
    return this.isEnded;
  }

  /** Audio time at which the song end was reached (valid once `ended`). */
  get endTime(): number {
    return this.endAt;
  }

  /** Notes the plan has started and not yet released, for tests and diagnostics. */
  get activeCount(): number {
    return this.active.size;
  }

  // ── time mapping ────────────────────────────────────────────────────────────────────────

  /** Audio time of unwrapped tick `u` under the tempo in force there. */
  timeOf(u: number): number {
    const a = this.tempoFor(u);
    return a.time + (u - a.u) * secondsPerTick(a.bpm);
  }

  /** Unwrapped tick (fractional) playing at audio time `t`. */
  uAt(t: number): number {
    let a = this.tempos[0]!;
    for (let i = this.tempos.length - 1; i >= 0; i--) {
      if (this.tempos[i]!.time <= t) {
        a = this.tempos[i]!;
        break;
      }
    }
    return a.u + (t - a.time) / secondsPerTick(a.bpm);
  }

  /** The playhead at audio time `t`. */
  positionAt(t: number): PlanPosition {
    const u = this.uAt(t);
    if (u < 0) return { tick: this.fromTick, countIn: true, ended: false };
    const song = Math.max(0, u + this.offsetFor(u));
    if (this.isEnded && t >= this.endAt) return { tick: this.endSong, countIn: false, ended: true };
    return { tick: song, countIn: false, ended: false };
  }

  private tempoFor(u: number): TempoAnchor {
    for (let i = this.tempos.length - 1; i >= 0; i--) if (this.tempos[i]!.u <= u) return this.tempos[i]!;
    return this.tempos[0]!;
  }

  private offsetFor(u: number): number {
    for (let i = this.wraps.length - 1; i >= 0; i--) if (this.wraps[i]!.u <= u) return this.wraps[i]!.offset;
    return this.wraps[0]!.offset;
  }

  // ── advancing ───────────────────────────────────────────────────────────────────────────

  /**
   * Events with audio time before `horizon`, in time order (a release comes before the attack that replaces it).
   * `now` is the audio clock (used to place late releases and catch-up notes no earlier than now).
   */
  advance(horizon: number, now: number, project: PlanProject, metronome: boolean): PlanEvent[] {
    if (this.isEnded) return [];
    const out: PlanEvent[] = [];
    this.applyTempo(project.tempo);
    this.prune(now);

    const sig = project.timeSignature;
    const pulse = clickTicks(sig);
    const barTicks = ticksPerBar(sig);
    const songEnd = songEndTick(project.lengthBars, sig);
    const index = indexNotes(project);

    // Notes deleted or shortened since the last call are released now, even if no new slice follows.
    this.releaseDue(this.cursorU, false, now, index, out);
    this.catchUp(now, project, index, out);

    while (!this.isEnded) {
      const slope = secondsPerTick(this.tempoFor(this.cursorU).bpm);
      const anchor = this.tempoFor(this.cursorU);
      const endU = Math.ceil((horizon - anchor.time) / slope) + anchor.u;
      const cu = this.cursorU;
      if (endU <= cu) break;

      if (cu < 0) {
        // Count-in: clicks only, spaced from the first one. A count-in is a request for clicks, so they
        // play whether or not the metronome is switched on for the song.
        const ce = Math.min(endU, 0);
        const u0 = this.wraps[0]!.u;
        for (let u = u0 + Math.ceil((cu - u0) / pulse) * pulse; u < ce; u += pulse) {
          out.push({ kind: 'click', time: this.timeOf(u), accent: (u - u0) % barTicks === 0 });
        }
        this.cursorU = ce;
        continue;
      }

      const offset = this.offsetFor(cu);
      const song0 = cu + offset;
      const loop = validLoop(project.loop, sig);
      if (loop !== null && song0 >= loop.end && this.inLoop) {
        // The loop was edited so that its end is now behind the playhead: wrap straight to its start.
        this.releaseAll(this.timeOf(cu), now, out);
        this.wraps.push({ u: cu, offset: loop.start - cu });
        continue;
      }
      const wrapsAtLoopEnd = loop !== null && song0 < loop.end;
      this.inLoop = wrapsAtLoopEnd;
      const boundary = wrapsAtLoopEnd ? loop.end : songEnd;
      if (song0 >= boundary) {
        // Already at/after the end (start position past the song, or the song was shortened).
        this.finish(cu, now, out);
        break;
      }
      const ce = Math.min(endU, cu + (boundary - song0));
      const song1 = song0 + (ce - cu);

      if (metronome) {
        for (let s = Math.ceil(song0 / pulse) * pulse; s < song1; s += pulse) {
          out.push({ kind: 'click', time: this.timeOf(s - offset), accent: s % barTicks === 0 });
        }
      }

      // Notes that start in this slice, in time order, with releases interleaved before each attack.
      const starts: { u: number; trackId: string; note: Note }[] = [];
      for (const t of project.tracks) {
        for (const n of t.notes) if (n.start >= song0 && n.start < song1) starts.push({ u: n.start - offset, trackId: t.id, note: n });
      }
      starts.sort((a, b) => a.u - b.u);
      for (const s of starts) this.startNote(s.u, s.trackId, s.note, now, index, out);
      this.releaseDue(ce, false, now, index, out);
      this.cursorU = ce;

      if (ce - cu === boundary - song0) {
        if (wrapsAtLoopEnd) {
          this.releaseAll(this.timeOf(ce), now, out);
          this.wraps.push({ u: ce, offset: loop.start - ce });
        } else {
          this.finish(ce, now, out);
        }
      }
    }

    // Stable sort by time: events were generated releases-first, so a retrigger of the same pitch at one
    // instant stays off-then-on, and a note's release never overtakes its own attack.
    return out.sort((a, b) => a.time - b.time);
  }

  /** Release every sounding note at `time` (used on stop-with-tail and by tests). */
  releaseAll(time: number, now: number, out: PlanEvent[]): void {
    for (const a of this.active.values()) {
      out.push({ kind: 'noteOff', time: Math.max(time, now, a.onTime), trackId: a.trackId, noteId: a.noteId, pitch: a.pitch });
    }
    this.active.clear();
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────

  private finish(u: number, now: number, out: PlanEvent[]): void {
    this.cursorU = u;
    this.releaseAll(this.timeOf(u), now, out);
    this.isEnded = true;
    this.endAt = this.timeOf(u);
    this.endSong = u + this.offsetFor(u);
  }

  /** A tempo change applies from the first event not yet scheduled. */
  private applyTempo(bpm: number): void {
    const last = this.tempos[this.tempos.length - 1]!;
    if (bpm === last.bpm) return;
    const time = this.timeOf(this.cursorU);
    if (last.u === this.cursorU) {
      last.bpm = bpm; // nothing has been scheduled under the old tempo from this point
      last.time = time;
    } else {
      this.tempos.push({ u: this.cursorU, time, bpm });
    }
  }

  /** Forget anchors and fired notes that lie entirely in the past, so long runs stay O(1). */
  private prune(now: number): void {
    // Keep anchors a little longer than "now": the playhead is read at the heard time, which trails the
    // audio clock by the output latency (and `positionAt` must still know the pre-wrap offset then).
    const keepFrom = now - PRUNE_GRACE_S;
    while (this.tempos.length > 1 && this.tempos[1]!.time <= keepFrom) this.tempos.shift();
    const uKeep = this.uAt(keepFrom);
    while (this.wraps.length > 1 && this.wraps[1]!.u <= uKeep) this.wraps.shift();
    const uNow = this.uAt(now);
    for (const [k, u] of this.fired) if (u < uNow - 1) this.fired.delete(k);
  }

  /**
   * Notes added (or moved) at or ahead of the playhead *behind* the scheduling cursor, i.e. inside the
   * window already handed to the engines, are started now at their proper time, once.
   */
  private catchUp(now: number, project: PlanProject, index: NoteIndex, out: PlanEvent[]): void {
    const cursor = this.cursorU;
    if (cursor <= 0) return;
    const lastWrap = this.wraps[this.wraps.length - 1]!;
    const lo = Math.max(Math.ceil(this.uAt(now)), lastWrap.u, 0);
    if (lo >= cursor) return;
    const offset = this.offsetFor(lo);
    const found: { u: number; trackId: string; note: Note }[] = [];
    for (const t of project.tracks) {
      for (const n of t.notes) {
        const u = n.start - offset;
        if (u >= lo && u < cursor && !this.fired.has(firedKey(t.id, n.id))) found.push({ u, trackId: t.id, note: n });
      }
    }
    found.sort((a, b) => a.u - b.u);
    for (const f of found) {
      const key = activeKey(f.trackId, f.note.pitch);
      const sounding = this.active.get(key);
      if (sounding && sounding.onU > f.u) continue; // a later note already holds this pitch
      this.startNote(f.u, f.trackId, f.note, now, index, out);
    }
  }

  private startNote(u: number, trackId: string, note: Note, now: number, index: NoteIndex, out: PlanEvent[]): void {
    this.releaseDue(u, true, now, index, out);
    const key = activeKey(trackId, note.pitch);
    const time = Math.max(this.timeOf(u), now);
    const prev = this.active.get(key);
    if (prev) {
      // Same pitch still sounding on this track: retrigger. (The engine would do the same.)
      out.push({ kind: 'noteOff', time, trackId, noteId: prev.noteId, pitch: prev.pitch });
      this.active.delete(key);
    }
    out.push({ kind: 'noteOn', time, trackId, noteId: note.id, pitch: note.pitch, velocity: note.velocity });
    this.active.set(key, { trackId, noteId: note.id, pitch: note.pitch, onU: u, onTime: time });
    this.fired.set(firedKey(trackId, note.id), u);
  }

  /** Release active notes whose end (from the note's current duration) is before `limitU`. */
  private releaseDue(limitU: number, inclusive: boolean, now: number, index: NoteIndex, out: PlanEvent[]): void {
    for (const [key, a] of this.active) {
      const note = index.get(a.trackId)?.get(a.noteId);
      // A deleted note, or a deleted track, is released at once.
      const offU = note ? a.onU + note.duration : -Infinity;
      if (inclusive ? offU > limitU : offU >= limitU) continue;
      out.push({
        kind: 'noteOff',
        time: Math.max(this.timeOf(offU), now, a.onTime),
        trackId: a.trackId,
        noteId: a.noteId,
        pitch: a.pitch,
      });
      this.active.delete(key);
    }
  }
}

type NoteIndex = Map<string, Map<string, Note>>;

function indexNotes(p: PlanProject): NoteIndex {
  const index: NoteIndex = new Map();
  for (const t of p.tracks) index.set(t.id, new Map(t.notes.map((n) => [n.id, n])));
  return index;
}

const activeKey = (trackId: string, pitch: number) => `${trackId}\u0000${pitch}`;
const firedKey = (trackId: string, noteId: string) => `${trackId}\u0000${noteId}`;

function validLoop(loop: LoopRegion, sig: TimeSignature): { start: number; end: number } | null {
  const l = loopTicks(loop, sig);
  return l && l.start < l.end ? l : null;
}
