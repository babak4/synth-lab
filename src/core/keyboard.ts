/**
 * Laptop-keyboard player mapping (PRD §5). Keys are identified by physical position
 * (`KeyboardEvent.code`), so the layout works unchanged on QWERTY, AZERTY and QWERTZ.
 *
 * Two manuals, like a two-tier organ: the lower one (Z row + S row) starts at C3, the upper one
 * (Q row + number row) at C4, so they overlap by an octave.
 */

/** Semitones above C3 (MIDI 48) at the default octave. */
const OFFSETS: Readonly<Record<string, number>> = {
  // Lower manual, white keys: C3 … E4
  KeyZ: 0, KeyX: 2, KeyC: 4, KeyV: 5, KeyB: 7, KeyN: 9, KeyM: 11, Comma: 12, Period: 14, Slash: 16,
  // Lower manual, black keys (sit between the whites above them)
  KeyS: 1, KeyD: 3, KeyG: 6, KeyH: 8, KeyJ: 10, KeyL: 13, Semicolon: 15,
  // Upper manual, white keys: C4 … G5
  KeyQ: 12, KeyW: 14, KeyE: 16, KeyR: 17, KeyT: 19, KeyY: 21, KeyU: 23, KeyI: 24, KeyO: 26, KeyP: 28, BracketLeft: 29, BracketRight: 31,
  // Upper manual, black keys
  Digit2: 13, Digit3: 15, Digit5: 18, Digit6: 20, Digit7: 22, Digit9: 25, Digit0: 27, Equal: 30,
};

export const BASE_PITCH = 48; // C3
export const MIN_OCTAVE = -3;
export const MAX_OCTAVE = 2;
export const VELOCITY_STEP = 16;

export const NOTE_CODES: readonly string[] = Object.keys(OFFSETS);

export const clampOctave = (o: number): number => Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, Math.round(o)));

/** MIDI pitch for a key at an octave offset, or null if the key is not a note or the pitch is off the keyboard. */
export function pitchForCode(code: string, octave: number): number | null {
  const off = OFFSETS[code];
  if (off === undefined) return null;
  const p = BASE_PITCH + off + 12 * clampOctave(octave);
  return p >= 0 && p <= 127 ? p : null;
}

/** Velocity ±16, clamped to 1–127. */
export function stepVelocity(v: number, dir: 1 | -1): number {
  return Math.min(127, Math.max(1, Math.round(v) + dir * VELOCITY_STEP));
}

/** Key caps as printed on a US keyboard. Use `layoutLabels()` to show the user's real caps. */
const US_LABELS: Readonly<Record<string, string>> = {
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', BracketLeft: '[', BracketRight: ']', Equal: '=',
};

export function defaultLabel(code: string): string {
  if (code in US_LABELS) return US_LABELS[code]!;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/** pitch → laptop key label for the keys reachable at `octave`. If two keys give a pitch (the overlap) the lower manual wins. */
export function labelsForOctave(octave: number, label: (code: string) => string = defaultLabel): Map<number, string> {
  const out = new Map<number, string>();
  for (const code of NOTE_CODES) {
    const p = pitchForCode(code, octave);
    if (p !== null && !out.has(p)) out.set(p, label(code));
  }
  return out;
}

/**
 * True for the key event that produces a question mark. `?` is reserved for "help for the focused
 * control" and must never play a note, whichever physical key produces it on the user's layout.
 */
export const isHelpKey = (e: { key: string }): boolean => e.key === '?';
