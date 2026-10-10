import { describe, expect, it } from 'vitest';
import { noteName } from './pitch';
import { MAX_OCTAVE, MIN_OCTAVE, NOTE_CODES, clampOctave, defaultLabel, isHelpKey, labelsForOctave, pitchForCode, stepVelocity } from './keyboard';

const names = (codes: string[], octave = 0) => codes.map((c) => noteName(pitchForCode(c, octave)!));

describe('key mapping (PRD §5.1)', () => {
  it('lower manual whites: Z X C V B N M , . / = C3 … E4', () => {
    expect(names(['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'])).toEqual(['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4']);
  });
  it('lower manual blacks: S D G H J L ;', () => {
    expect(names(['KeyS', 'KeyD', 'KeyG', 'KeyH', 'KeyJ', 'KeyL', 'Semicolon'])).toEqual(['C#3', 'D#3', 'F#3', 'G#3', 'A#3', 'C#4', 'D#4']);
  });
  it('upper manual whites: Q … ] = C4 … G5', () => {
    expect(names(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'])).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5']);
  });
  it('upper manual blacks: 2 3 5 6 7 9 0 =', () => {
    expect(names(['Digit2', 'Digit3', 'Digit5', 'Digit6', 'Digit7', 'Digit9', 'Digit0', 'Equal'])).toEqual(['C#4', 'D#4', 'F#4', 'G#4', 'A#4', 'C#5', 'D#5', 'F#5']);
  });
  it('has 37 note keys: 17 on the lower manual and 20 on the upper', () => {
    expect(NOTE_CODES.length).toBe(37);
  });
  it('the manuals overlap by an octave, so either hand reaches C4–E4', () => {
    expect(pitchForCode('Comma', 0)).toBe(pitchForCode('KeyQ', 0)); // C4
    expect(pitchForCode('Slash', 0)).toBe(pitchForCode('KeyE', 0)); // E4
    expect(pitchForCode('Semicolon', 0)).toBe(pitchForCode('Digit3', 0)); // D#4
  });
  it('maps by physical position: it never looks at the character a key produces', () => {
    // Same code, any layout: pitchForCode takes only the code.
    expect(pitchForCode('KeyQ', 0)).toBe(60); // "A" on AZERTY, "Q" on QWERTY/QWERTZ: still C4
    expect(pitchForCode('KeyZ', 0)).toBe(48); // "W" on AZERTY, "Y" on QWERTZ: still C3
  });
  it('ignores keys that are not notes', () => {
    for (const c of ['Space', 'Enter', 'Tab', 'ArrowUp', 'Digit1', 'Digit4', 'Digit8', 'Minus', 'KeyA', 'KeyF', 'KeyK', 'Quote']) expect(pitchForCode(c, 0), c).toBeNull();
  });
});

describe('octave shifting (PRD §5.2)', () => {
  it('moves both manuals by 12 semitones per octave', () => {
    expect(pitchForCode('KeyZ', 1)).toBe(60);
    expect(pitchForCode('KeyZ', -1)).toBe(36);
    expect(pitchForCode('KeyQ', 2)).toBe(84);
  });
  it('clamps the octave so the whole player stays inside C0–C8 (MIDI 12–108)', () => {
    expect(clampOctave(9)).toBe(MAX_OCTAVE);
    expect(clampOctave(-9)).toBe(MIN_OCTAVE);
    for (const o of [MIN_OCTAVE, MAX_OCTAVE]) {
      const ps = NOTE_CODES.map((c) => pitchForCode(c, o)!);
      expect(Math.min(...ps)).toBeGreaterThanOrEqual(12);
      expect(Math.max(...ps)).toBeLessThanOrEqual(108);
    }
    expect(pitchForCode('KeyZ', MIN_OCTAVE)).toBe(12); // C0
  });
});

describe('velocity (PRD §5.2)', () => {
  it('steps by 16 within 1–127', () => {
    expect(stepVelocity(96, 1)).toBe(112);
    expect(stepVelocity(96, -1)).toBe(80);
    expect(stepVelocity(120, 1)).toBe(127);
    expect(stepVelocity(10, -1)).toBe(1);
    expect(stepVelocity(1, -1)).toBe(1);
  });
});

describe('labels and the help key', () => {
  it('labels keys as printed on a US keyboard', () => {
    expect(['KeyZ', 'Digit2', 'Comma', 'Slash', 'BracketLeft', 'Equal', 'Semicolon'].map(defaultLabel)).toEqual(['Z', '2', ',', '/', '[', '=', ';']);
  });
  it('labels the keys reachable at an octave, lower manual winning the overlap', () => {
    const l = labelsForOctave(0);
    expect(l.get(48)).toBe('Z');
    expect(l.get(60)).toBe(','); // C4 is both "," and "Q"; the lower manual wins
    expect(l.get(79)).toBe(']'); // G5
    // C3 … G5 is 32 consecutive semitones; the 5 overlapping pitches (C4 … E4) have two keys each, 37 − 5 = 32.
    expect(l.size).toBe(32);
    expect([...l.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 32 }, (_, i) => 48 + i)); // no gaps
  });
  it('treats "?" as the help key whatever physical key made it', () => {
    expect(isHelpKey({ key: '?' })).toBe(true);
    expect(isHelpKey({ key: '/' })).toBe(false);
    expect(isHelpKey({ key: 'q' })).toBe(false);
  });
});
