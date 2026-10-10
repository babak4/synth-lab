import { describe, expect, it } from 'vitest';
import { PANIC_FADE_S, VoiceAllocator, type AllocVoice, type VoiceMode } from './allocator';

class FakeVoice implements AllocVoice {
  static count = 0;
  readonly id = ++FakeVoice.count;
  isEnded = false;
  silentAt: number | null = null;
  pitch = -1;
  /** Envelope gate. */
  gated = false;
  stolen = false;
  retired = false;
  log: string[] = [];
  trigger(pitch: number, _v: number, t: number, o: { glide?: number; legato?: boolean } = {}) {
    this.pitch = pitch;
    if (!o.legato) this.gated = true;
    this.log.push(`trigger ${pitch}@${t}${o.glide ? ` glide=${o.glide}` : ''}${o.legato ? ' legato' : ''}`);
  }
  release(t: number) {
    this.gated = false;
    this.silentAt = t + 0.5;
    this.log.push(`release@${t}`);
    return this.silentAt;
  }
  retire(t?: number) {
    this.retired = true;
    this.log.push(`retire@${t}`);
  }
  steal(t: number, fade: number) {
    this.gated = false;
    this.stolen = true;
    this.isEnded = true;
    this.log.push(`steal@${t} fade=${fade}`);
  }
  /** Simulate the audio clock reaching the end of a retired voice. */
  finish() {
    this.isEnded = true;
  }
}

function setup(mode: VoiceMode = 'poly', maxVoices = 8) {
  const made: FakeVoice[] = [];
  const a = new VoiceAllocator<FakeVoice>(() => {
    const v = new FakeVoice();
    made.push(v);
    return v;
  });
  a.setMode(mode, 0);
  a.setMaxVoices(maxVoices, 0);
  return { a, made };
}
const sounding = (made: FakeVoice[]) => made.filter((v) => !v.isEnded && !v.stolen);
const gatedPitches = (made: FakeVoice[]) => made.filter((v) => v.gated && !v.stolen).map((v) => v.pitch).sort((x, y) => x - y);

describe('poly', () => {
  it('gives each note its own voice and releases only the right one', () => {
    const { a, made } = setup();
    a.noteOn(60, 100, 0);
    a.noteOn(64, 100, 0);
    a.noteOn(67, 100, 0);
    expect(made.length).toBe(3);
    a.noteOff(64, 1);
    expect(gatedPitches(made)).toEqual([60, 67]);
    expect(made[1]!.retired).toBe(true);
  });

  it('steals the oldest held note at the voice limit, with a 5 ms fade', () => {
    const { a, made } = setup('poly', 3);
    [60, 62, 64].forEach((p, i) => a.noteOn(p, 100, i));
    a.noteOn(65, 100, 3);
    expect(made[0]!.log).toContain('steal@3 fade=0.005');
    expect(gatedPitches(made)).toEqual([62, 64, 65]);
    expect(a.voices.length).toBe(3);
  });

  it('prefers stealing a voice that is already in release over a held one', () => {
    const { a, made } = setup('poly', 3);
    [60, 62, 64].forEach((p, i) => a.noteOn(p, 100, i));
    a.noteOff(62, 3); // 62 is now releasing (and still counts as a voice)
    a.noteOn(65, 100, 4);
    expect(made[1]!.stolen).toBe(true);
    expect(made[0]!.stolen).toBe(false);
  });

  it('lowering the voice count steals the oldest voices immediately', () => {
    const { a, made } = setup('poly', 8);
    [60, 62, 64, 65].forEach((p) => a.noteOn(p, 100, 0));
    a.setMaxVoices(2, 1);
    expect(gatedPitches(made)).toEqual([64, 65]);
  });

  it('re-striking a held pitch releases the old voice instead of stacking', () => {
    const { a, made } = setup();
    a.noteOn(60, 100, 0);
    a.noteOn(60, 100, 1);
    expect(made.length).toBe(2);
    expect(made[0]!.gated).toBe(false);
    expect(gatedPitches(made)).toEqual([60]);
  });

  it('ignores a note-off for a note that is not down', () => {
    const { a, made } = setup();
    a.noteOff(60, 0);
    a.noteOn(62, 100, 0);
    a.noteOff(60, 1);
    expect(gatedPitches(made)).toEqual([62]);
  });

  it('forgets ended voices so they stop counting against the limit', () => {
    const { a, made } = setup('poly', 2);
    a.noteOn(60, 100, 0);
    a.noteOn(62, 100, 0);
    a.noteOff(60, 1);
    made[0]!.finish();
    a.noteOn(64, 100, 2);
    expect(made.filter((v) => v.stolen).length).toBe(0);
  });
});

describe('sustain pedal', () => {
  it('holds released notes until the pedal lifts', () => {
    const { a, made } = setup();
    a.noteOn(60, 100, 0);
    a.noteOn(64, 100, 0);
    a.setSustain(true, 1);
    a.noteOff(60, 2);
    a.noteOff(64, 2);
    expect(gatedPitches(made)).toEqual([60, 64]);
    a.setSustain(false, 3);
    expect(gatedPitches(made)).toEqual([]);
    expect(made.every((v) => v.retired)).toBe(true);
  });

  it('a note still physically held survives the pedal lifting', () => {
    const { a, made } = setup();
    a.setSustain(true, 0);
    a.noteOn(60, 100, 0);
    a.noteOn(64, 100, 0);
    a.noteOff(60, 1);
    a.setSustain(false, 2);
    expect(gatedPitches(made)).toEqual([64]);
  });

  it('notes struck after pedal-down also sustain, and re-striking a sustained pitch replaces it', () => {
    const { a, made } = setup();
    a.setSustain(true, 0);
    a.noteOn(60, 100, 0);
    a.noteOff(60, 1);
    a.noteOn(60, 100, 2);
    expect(made.length).toBe(2);
    expect(made[0]!.gated).toBe(false);
    expect(made[1]!.gated).toBe(true);
  });

  it('is idempotent', () => {
    const { a, made } = setup();
    a.noteOn(60, 100, 0);
    a.setSustain(true, 0);
    a.setSustain(true, 0);
    a.noteOff(60, 1);
    a.setSustain(false, 2);
    a.setSustain(false, 2);
    expect(gatedPitches(made)).toEqual([]);
  });
});

describe('mono', () => {
  it('uses a single voice and retriggers on each note', () => {
    const { a, made } = setup('mono');
    a.noteOn(60, 100, 0);
    a.noteOn(64, 100, 1);
    expect(made.length).toBe(1);
    expect(made[0]!.log.filter((l) => l.startsWith('trigger'))).toEqual(['trigger 60@0', 'trigger 64@1']);
  });

  it('returns to the previous held note when the top note is released (last-note priority)', () => {
    const { a, made } = setup('mono');
    a.noteOn(60, 100, 0);
    a.noteOn(64, 100, 1);
    a.noteOn(67, 100, 2);
    a.noteOff(67, 3);
    expect(made[0]!.pitch).toBe(64);
    a.noteOff(64, 4);
    expect(made[0]!.pitch).toBe(60);
    expect(made[0]!.gated).toBe(true);
    a.noteOff(60, 5);
    expect(made[0]!.gated).toBe(false);
  });

  it('releasing a non-top note changes nothing audible', () => {
    const { a, made } = setup('mono');
    a.noteOn(60, 100, 0);
    a.noteOn(64, 100, 1);
    const before = made[0]!.log.length;
    a.noteOff(60, 2);
    expect(made[0]!.log.length).toBe(before);
    a.noteOff(64, 3);
    expect(made[0]!.gated).toBe(false);
  });

  it('passes the glide time on retriggers but not on the first note', () => {
    const { a, made } = setup('mono');
    a.setGlide(0.25);
    a.noteOn(60, 100, 0);
    a.noteOn(72, 100, 1);
    expect(made[0]!.log).toContain('trigger 60@0');
    expect(made[0]!.log).toContain('trigger 72@1 glide=0.25');
  });

  it('reuses a still-ringing voice for the next note, and retires it once silent', () => {
    const { a, made } = setup('mono');
    a.noteOn(60, 100, 0);
    a.noteOff(60, 1); // silentAt = 1.5
    a.noteOn(62, 100, 1.2);
    expect(made.length).toBe(1);
    a.noteOff(62, 2);
    a.tick(2.2);
    expect(made[0]!.retired).toBe(false);
    a.tick(2.6);
    expect(made[0]!.retired).toBe(true);
    a.noteOn(64, 100, 3);
    expect(made.length).toBe(2);
  });

  it('sustain defers only the final release', () => {
    const { a, made } = setup('mono');
    a.noteOn(60, 100, 0);
    a.setSustain(true, 0);
    a.noteOff(60, 1);
    expect(made[0]!.gated).toBe(true);
    a.noteOn(64, 100, 2); // retriggers the same, still-gated voice
    expect(made.length).toBe(1);
    a.noteOff(64, 3);
    a.setSustain(false, 4);
    expect(made[0]!.gated).toBe(false);
  });
});

describe('legato', () => {
  it('first note triggers; overlapping notes only glide (no envelope retrigger)', () => {
    const { a, made } = setup('legato');
    a.setGlide(0.1);
    a.noteOn(60, 100, 0);
    a.noteOn(64, 100, 1);
    expect(made[0]!.log).toEqual(['trigger 60@0', 'trigger 64@1 glide=0.1 legato']);
  });

  it('returning to a held note is also legato', () => {
    const { a, made } = setup('legato');
    a.noteOn(60, 100, 0);
    a.noteOn(64, 100, 1);
    a.noteOff(64, 2);
    expect(made[0]!.log.at(-1)).toBe('trigger 60@2 legato');
    expect(made[0]!.gated).toBe(true);
  });

  it('a note after a full release retriggers normally', () => {
    const { a, made } = setup('legato');
    a.noteOn(60, 100, 0);
    a.noteOff(60, 1);
    a.noteOn(64, 100, 1.2);
    expect(made[0]!.log.at(-1)).toBe('trigger 64@1.2');
  });
});

describe('mode changes and panic', () => {
  it('changing mode silences held notes (no carry-over)', () => {
    const { a, made } = setup('poly');
    a.noteOn(60, 100, 0);
    a.noteOn(64, 100, 0);
    a.setMode('mono', 1);
    expect(made.every((v) => v.stolen)).toBe(true);
    a.noteOn(67, 100, 2);
    expect(sounding(made).length).toBe(1);
  });

  it('allNotesOff fades every voice and clears the held stack', () => {
    const { a, made } = setup('mono');
    a.noteOn(60, 100, 0);
    a.noteOn(64, 100, 0);
    a.allNotesOff(1);
    expect(made[0]!.log.at(-1)).toBe(`steal@1 fade=${PANIC_FADE_S}`);
    a.noteOn(67, 100, 2);
    a.noteOff(67, 3);
    expect(made.at(-1)!.gated).toBe(false); // nothing left over from the cleared stack
  });
});

// ── fuzz ──────────────────────────────────────────────────────────────────────────────────

/** Small deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe.each<VoiceMode>(['poly', 'mono', 'legato'])('fuzz (%s): 10,000 random events', (mode) => {
  it('never leaves a stuck note and never exceeds the voice limit', () => {
    const rand = rng(mode.length * 7919);
    const { a, made } = setup(mode, 4);
    a.setGlide(0.05);
    const down = new Set<number>();
    let pedal = false;
    let t = 0;

    for (let i = 0; i < 10_000; i++) {
      t += rand() * 0.05;
      const r = rand();
      const pitch = 48 + Math.floor(rand() * 24);
      if (r < 0.4) {
        a.noteOn(pitch, 1 + Math.floor(rand() * 127), t);
        down.add(pitch);
      } else if (r < 0.8) {
        a.noteOff(pitch, t);
        down.delete(pitch);
      } else if (r < 0.88) {
        pedal = !pedal;
        a.setSustain(pedal, t);
      } else if (r < 0.9) {
        a.setMaxVoices(1 + Math.floor(rand() * 8), t);
      } else if (r < 0.93) {
        a.allNotesOff(t);
        down.clear();
      } else if (r < 0.96) {
        // time passes: some retired voices reach silence
        for (const v of made) if (v.retired && rand() < 0.5) v.finish();
        a.tick(t);
      } else {
        a.noteOff(pitch, t);
        down.delete(pitch);
      }
      expect(a.voices.length, `voice limit @${i}`).toBeLessThanOrEqual(8);
      if (mode === 'poly') expect(a.voices.filter((v) => !v.isEnded).length).toBeLessThanOrEqual(8);
      else expect(a.voices.length).toBeLessThanOrEqual(1);
    }

    // Lift the pedal and every key: nothing may still be gated.
    for (const p of [...down]) a.noteOff(p, t + 1);
    a.setSustain(false, t + 1);
    expect(gatedPitches(made), 'stuck notes').toEqual([]);
    expect(a.heldCount).toBe(0);
    expect(made.filter((v) => v.gated && !v.stolen).length).toBe(0);
  });
});
