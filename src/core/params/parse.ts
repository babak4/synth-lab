/**
 * Typed values for numeric readouts (plan T2.6): the inverse of `formatValue`.
 *
 * Accepts what the readout shows ("8.00 kHz", "300 ms", "−12.0 dB", "Q 1.0", "+3 st") and plain
 * shorthand ("2.5k", "2500", "0.3 s", "50%"). The result is clamped to the control's range and
 * snapped to its step, exactly as dragging the knob would.
 *
 * A bare number is read in the control's display unit, with two conveniences:
 *  - for time controls (stored in seconds) a bare number larger than the control's maximum is read
 *    as milliseconds, so "300" means 300 ms while "0.3" and "2" mean seconds;
 *  - for dB controls "-inf" / "−∞" means the minimum (silence).
 */
import { quantise } from './scale';
import type { ContinuousParamDef, Unit } from './types';

export type ParseResult = { ok: true; value: number; clamped: boolean } | { ok: false; error: string };

const SUFFIXES: Record<Unit, readonly string[]> = {
  '': [''],
  '%': ['', '%'],
  s: ['', 's', 'sec', 'secs', 'ms'],
  Hz: ['', 'hz', 'khz', 'k'],
  cents: ['', 'c', 'cent', 'cents'],
  semitones: ['', 'st', 'semitone', 'semitones'],
  octaves: ['', 'oct', 'octave', 'octaves'],
  dB: ['', 'db'],
  Q: [''],
  voices: ['', 'voice', 'voices'],
  velocity: [''],
};

const EXAMPLES: Record<Unit, string> = {
  '': 'a number',
  '%': 'a percentage such as 50 or 50%',
  s: 'a time such as 300 ms or 0.3 s',
  Hz: 'a frequency such as 440, 2.5k or 8 kHz',
  cents: 'cents such as -12',
  semitones: 'semitones such as +7',
  octaves: 'octaves such as -1',
  dB: 'decibels such as -12 or -6 dB',
  Q: 'a number such as 4',
  voices: 'a number of voices such as 4',
  velocity: 'a number from 1 to 127',
};

export function parseValue(def: ContinuousParamDef, text: string): ParseResult {
  const bad = (): ParseResult => ({ ok: false, error: `Enter ${EXAMPLES[def.unit]}.` });
  let t = text.trim().toLowerCase().replace(/[−–—]/g, '-').replace(/,/g, '');
  if (t === '') return bad();

  if (def.unit === 'dB' && /^-\s*(inf|infinity|∞)(\s*db)?$/.test(t))
    return { ok: true, value: def.min, clamped: false };
  if (def.unit === 'Q') t = t.replace(/^q\s*/, '');

  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/.exec(t);
  if (!m) return bad();
  const n = Number(m[1]);
  const suffix = m[2]!;
  if (!Number.isFinite(n) || !SUFFIXES[def.unit].includes(suffix)) return bad();

  let v: number;
  switch (def.unit) {
    case '%':
      v = n / 100;
      break;
    case 's':
      v = suffix === 'ms' || (suffix === '' && n > def.max) ? n / 1000 : n;
      break;
    case 'Hz':
      v = suffix === 'khz' || suffix === 'k' ? n * 1000 : n;
      break;
    default:
      v = n;
  }

  const snapped = quantise(def, v);
  return { ok: true, value: snapped, clamped: v < def.min || v > def.max };
}
