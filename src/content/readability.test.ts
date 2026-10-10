import { describe, expect, it } from 'vitest';
import { countSyllables, fleschKincaidGrade } from './readability';

describe('readability', () => {
  it('counts syllables well enough for everyday and technical words', () => {
    const cases: [string, number][] = [['cat', 1], ['filter', 2], ['synthesiser', 4], ['envelope', 3], ['oscillator', 4], ['harmonic', 3], ['the', 1], ['made', 1], ['wave', 1], ['sounds', 1], ['frequency', 3], ['resonance', 3]];
    for (const [w, n] of cases) expect(Math.abs(countSyllables(w) - n), `${w}: got ${countSyllables(w)}, want ${n}`).toBeLessThanOrEqual(1);
    expect(countSyllables('')).toBe(0);
  });

  it('scores simple prose low and dense prose high', () => {
    const simple = 'The cat sat on the mat. It was a big cat. The dog ran to the cat.';
    const dense = 'Notwithstanding considerable disagreement regarding electromagnetic interference, characteristically sophisticated instrumentation necessitates comprehensive calibration.';
    expect(fleschKincaidGrade(simple)).toBeLessThan(2);
    expect(fleschKincaidGrade(dense)).toBeGreaterThan(14);
    expect(fleschKincaidGrade('')).toBe(0);
  });
});
