/**
 * Voice allocator (plan T1.4): poly / mono / legato note handling, voice stealing, sustain pedal.
 *
 * Pure policy: it talks to voices through `AllocVoice`, so it is unit-testable without Web Audio.
 *
 * Semantics
 *  - poly:   one voice per note; at the voice limit the oldest voice is stolen with a short fade
 *            (voices already in their release tail go first, then the oldest held note).
 *  - mono:   one voice, last-note priority, envelopes retrigger on every new note and when
 *            returning to a still-held earlier note; pitch glides if glide > 0.
 *  - legato: as mono, but while a note is held the next note only changes pitch (glide) and the
 *            envelopes keep running.
 *  - sustain pedal: key-ups are deferred until the pedal lifts. In mono/legato only the final
 *            release is deferred (the held-note stack still tracks the keys).
 *  - allNotesOff: panic — every voice fades out in PANIC_FADE_S and nothing is left sounding.
 */
import { SMOOTHING } from '@/core/contracts/engine';

export type VoiceMode = 'poly' | 'mono' | 'legato';

/** What the allocator needs from a voice. The real `Voice` satisfies this. */
export interface AllocVoice {
  readonly isEnded: boolean;
  readonly silentAt: number | null;
  trigger(pitch: number, velocity: number, time: number, opts?: { glide?: number; legato?: boolean }): void;
  /** Release; returns the time the voice is inaudible. */
  release(time: number): number;
  retire(time?: number): void;
  steal(time: number, fadeS: number): void;
}

export const PANIC_FADE_S = 0.03;

interface Entry<V> {
  voice: V;
  pitch: number;
  /** Envelope gate is on (not yet released). */
  gated: boolean;
  /** Physical key is down. */
  keyDown: boolean;
  order: number;
}

export class VoiceAllocator<V extends AllocVoice = AllocVoice> {
  private mode: VoiceMode = 'poly';
  private maxVoices = 8;
  private glide = 0;
  private sustain = false;
  private order = 0;

  private poly: Entry<V>[] = [];
  private mono: Entry<V> | null = null;
  /** Mono/legato held-key stack, most recent last. */
  private stack: { pitch: number; velocity: number }[] = [];

  constructor(private readonly createVoice: (time: number) => V) {}

  // ── configuration ───────────────────────────────────────────────────────────────────────

  setMode(mode: VoiceMode, time: number): void {
    if (mode === this.mode) return;
    this.allNotesOff(time); // never carry held notes across a mode change
    this.mode = mode;
  }

  setGlide(seconds: number): void {
    this.glide = Math.max(0, seconds);
  }

  setMaxVoices(n: number, time: number): void {
    this.maxVoices = Math.min(8, Math.max(1, Math.round(n)));
    this.prune();
    while (this.mode === 'poly' && this.poly.length > this.maxVoices) this.stealOne(time);
  }

  // ── notes ───────────────────────────────────────────────────────────────────────────────

  noteOn(pitch: number, velocity: number, time: number): void {
    this.prune();
    if (this.mode === 'poly') this.polyOn(pitch, velocity, time);
    else this.monoOn(pitch, velocity, time);
  }

  noteOff(pitch: number, time: number): void {
    this.prune();
    if (this.mode === 'poly') this.polyOff(pitch, time);
    else this.monoOff(pitch, time);
  }

  setSustain(down: boolean, time: number): void {
    if (down === this.sustain) return;
    this.sustain = down;
    if (down) return;
    if (this.mode === 'poly') {
      for (const e of this.poly) if (e.gated && !e.keyDown) this.releaseEntry(e, time);
    } else if (this.mono?.gated && this.stack.length === 0) {
      this.releaseEntry(this.mono, time);
    }
  }

  /** Panic: fade everything out quickly, forget every held key. */
  allNotesOff(time: number): void {
    for (const e of this.poly) e.voice.steal(time, PANIC_FADE_S);
    if (this.mono) this.mono.voice.steal(time, PANIC_FADE_S);
    this.poly = [];
    this.mono = null;
    this.stack = [];
  }

  /** Housekeeping, called periodically with the audio clock. */
  tick(now: number): void {
    this.prune();
    const m = this.mono;
    if (m && !m.gated && m.voice.silentAt !== null && now >= m.voice.silentAt) {
      m.voice.retire(now);
      this.mono = null;
    }
  }

  // ── inspection (for the engine and tests) ───────────────────────────────────────────────

  get voices(): readonly V[] {
    this.prune();
    return [...this.poly.map((e) => e.voice), ...(this.mono ? [this.mono.voice] : [])];
  }

  get heldCount(): number {
    return this.mode === 'poly' ? this.poly.filter((e) => e.gated).length : this.mono?.gated ? 1 : 0;
  }

  // ── poly ────────────────────────────────────────────────────────────────────────────────

  private polyOn(pitch: number, velocity: number, time: number): void {
    // Re-striking a pitch that is still gated (held or sustained) releases the old voice first.
    for (const e of this.poly) if (e.pitch === pitch && e.gated) this.releaseEntry(e, time);
    while (this.poly.length >= this.maxVoices) this.stealOne(time);
    const voice = this.createVoice(time);
    voice.trigger(pitch, velocity, time);
    this.poly.push({ voice, pitch, gated: true, keyDown: true, order: this.order++ });
  }

  private polyOff(pitch: number, time: number): void {
    // The most recent key-down entry for this pitch.
    const e = [...this.poly].reverse().find((x) => x.pitch === pitch && x.keyDown);
    if (!e) return;
    e.keyDown = false;
    if (!this.sustain) this.releaseEntry(e, time);
  }

  private stealOne(time: number): void {
    // Prefer voices that are already releasing, then the oldest held note.
    const releasing = this.poly.filter((e) => !e.gated);
    const pool = releasing.length ? releasing : this.poly;
    const victim = pool.reduce((a, b) => (b.order < a.order ? b : a));
    victim.voice.steal(time, SMOOTHING.stealFadeMs / 1000);
    this.poly = this.poly.filter((e) => e !== victim);
  }

  private releaseEntry(e: Entry<V>, time: number): void {
    if (!e.gated) return;
    e.gated = false;
    const end = e.voice.release(time);
    if (this.mode === 'poly') e.voice.retire(end); // single-use: stop when the tail has died away
  }

  // ── mono / legato ───────────────────────────────────────────────────────────────────────

  private monoOn(pitch: number, velocity: number, time: number): void {
    this.stack = this.stack.filter((k) => k.pitch !== pitch);
    this.stack.push({ pitch, velocity });

    const m = this.mono;
    if (!m || m.voice.isEnded) {
      const voice = this.createVoice(time);
      voice.trigger(pitch, velocity, time);
      this.mono = { voice, pitch, gated: true, keyDown: true, order: this.order++ };
      return;
    }
    const legato = this.mode === 'legato' && m.gated;
    m.voice.trigger(pitch, velocity, time, { glide: this.glide, legato });
    m.pitch = pitch;
    m.gated = true;
    m.keyDown = true;
  }

  private monoOff(pitch: number, time: number): void {
    const i = this.stack.findIndex((k) => k.pitch === pitch);
    if (i < 0) return;
    const wasTop = i === this.stack.length - 1;
    this.stack.splice(i, 1);
    const m = this.mono;
    if (!m) return;

    if (this.stack.length === 0) {
      m.keyDown = false;
      if (!this.sustain) this.releaseEntry(m, time);
    } else if (wasTop) {
      // Fall back to the previous still-held key.
      const prev = this.stack[this.stack.length - 1]!;
      m.voice.trigger(prev.pitch, prev.velocity, time, { glide: this.glide, legato: this.mode === 'legato' });
      m.pitch = prev.pitch;
    }
  }

  // ── bookkeeping ─────────────────────────────────────────────────────────────────────────

  private prune(): void {
    this.poly = this.poly.filter((e) => !e.voice.isEnded);
    if (this.mono?.voice.isEnded) this.mono = null;
  }
}
