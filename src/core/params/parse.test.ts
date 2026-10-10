import { describe, expect, it } from 'vitest';
import { PARAM_DEFS, getParamDef, type ParamId } from './registry';
import { parseValue } from './parse';
import { formatValue, valueToNorm, normToValue } from './scale';
import type { ContinuousParamDef } from './types';

const def = (id: ParamId) => getParamDef(id) as ContinuousParamDef;
const ok = (id: ParamId, text: string) => {
  const r = parseValue(def(id), text);
  if (!r.ok) throw new Error(`"${text}" rejected: ${r.error}`);
  return r.value;
};

describe('parseValue: shorthand a player would type', () => {
  it('frequencies', () => {
    expect(ok('filter-cutoff', '2.5k')).toBeCloseTo(2500, 6);
    expect(ok('filter-cutoff', '2500')).toBe(2500);
    expect(ok('filter-cutoff', '8 kHz')).toBe(8000);
    expect(ok('filter-cutoff', '440hz')).toBe(440);
    expect(ok('master-tune', '442')).toBe(442);
  });
  it('times: ms and s, and a bare number larger than the range is read as milliseconds', () => {
    expect(ok('amp-env-attack', '300 ms')).toBeCloseTo(0.3, 9);
    expect(ok('amp-env-attack', '0.3 s')).toBeCloseTo(0.3, 9);
    expect(ok('amp-env-attack', '0.3')).toBeCloseTo(0.3, 9);
    expect(ok('amp-env-attack', '2')).toBe(2);
    expect(ok('amp-env-attack', '300')).toBeCloseTo(0.3, 9); // 300 > max (5 s) so milliseconds
    expect(ok('delay-time', '250')).toBeCloseTo(0.25, 9);
    expect(ok('voice-glide', '120 ms')).toBeCloseTo(0.12, 9);
  });
  it('percentages: bare numbers are percent, as displayed', () => {
    expect(ok('mix-osc-a', '50')).toBeCloseTo(0.5, 9);
    expect(ok('mix-osc-a', '50%')).toBeCloseTo(0.5, 9);
    expect(ok('filter-env-amount', '-25%')).toBeCloseTo(-0.25, 9);
    expect(ok('filter-env-amount', '+100')).toBe(1);
  });
  it('decibels, including the typographic minus the readout displays and silence', () => {
    expect(ok('master-volume', '-12')).toBe(-12);
    expect(ok('master-volume', '−6.0 dB')).toBe(-6);
    expect(ok('master-volume', '-inf')).toBe(-60);
    expect(ok('master-volume', '−∞ dB')).toBe(-60);
    expect(ok('dist-drive', '24 dB')).toBe(24);
  });
  it('pitch units, Q, voices, velocity', () => {
    expect(ok('osc-a-fine', '-12 cents')).toBe(-12);
    expect(ok('osc-a-fine', '+7')).toBe(7);
    expect(ok('osc-a-semitone', '+3 st')).toBe(3);
    expect(ok('osc-a-octave', '-1 oct')).toBe(-1);
    expect(ok('filter-resonance', 'Q 4')).toBe(4);
    expect(ok('voice-count', '4 voices')).toBe(4);
    expect(ok('kbd-velocity', '100')).toBe(100);
  });
  it('is tolerant of case, spacing and thousands separators', () => {
    expect(ok('filter-cutoff', '  2.5 K ')).toBeCloseTo(2500, 6);
    expect(ok('filter-cutoff', '1,200 Hz')).toBe(1200);
    expect(ok('filter-cutoff', '.5k')).toBeCloseTo(500, 6);
  });
});

describe('parseValue: range and step', () => {
  it('clamps to the range, and says it did', () => {
    const r = parseValue(def('filter-cutoff'), '99k');
    expect(r).toEqual({ ok: true, value: 20000, clamped: true });
    expect(parseValue(def('filter-cutoff'), '1')).toEqual({ ok: true, value: 20, clamped: true });
    expect(parseValue(def('filter-cutoff'), '440')).toMatchObject({ clamped: false });
  });
  it('snaps stepped controls to their step', () => {
    expect(ok('osc-a-octave', '1.6')).toBe(2);
    expect(ok('voice-count', '3.4')).toBe(3);
    expect(ok('filter-key-tracking', '30')).toBe(0.5); // 30% snaps to the nearest of 0, 50, 100
    expect(ok('master-tune', '441.4')).toBe(441);
  });
});

describe('parseValue: rejects what is not a value, with a hint', () => {
  const rejects = (id: ParamId, text: string) => {
    const r = parseValue(def(id), text);
    expect(r.ok, `"${text}" should be rejected`).toBe(false);
    return r.ok ? '' : r.error;
  };
  it('empty, words, and numbers with the wrong unit', () => {
    expect(rejects('filter-cutoff', '')).toMatch(/frequency/);
    rejects('filter-cutoff', 'loud');
    rejects('filter-cutoff', '300 ms');
    rejects('amp-env-attack', '300 Hz');
    rejects('mix-osc-a', '5 dB');
    rejects('master-volume', '12 st');
    rejects('filter-cutoff', '1.2.3');
    rejects('filter-cutoff', '2.5 kk');
  });
  it('does not accept NaN, Infinity or script', () => {
    for (const t of ['NaN', 'Infinity', '1e999', '<script>', '2 +', '--3']) rejects('filter-cutoff', t);
  });
  it('the error says what to type for that control', () => {
    expect(rejects('amp-env-attack', 'x')).toMatch(/300 ms/);
    expect(rejects('master-volume', 'x')).toMatch(/decibels/);
    expect(rejects('mix-osc-a', 'x')).toMatch(/50%/);
  });
});

describe('round trip: what the readout shows can be typed back (every continuous control)', () => {
  const continuous = PARAM_DEFS.filter((d) => d.type === 'continuous') as unknown as ContinuousParamDef[];
  it('covers a useful number of controls', () => expect(continuous.length).toBeGreaterThan(40));

  it.each(continuous.map((d): [string, ContinuousParamDef] => [d.id, d]))('%s', (_id, d) => {
    // The readout rounds to ~3 significant figures, or to a whole percent, so the trip back can differ by
    // display precision: at most half a percent of the range, half a percentage point, or one step.
    const tolerance = Math.max(d.step, 0.005 * (d.max - d.min), d.unit === '%' ? 0.005 : 0) + 1e-9;
    const samples = [d.min, d.default, d.max, ...[0.1, 0.25, 0.5, 0.75, 0.9].map((n) => normToValue(d, n))];
    for (const v of samples) {
      const shown = formatValue(d, v);
      const back = parseValue(d, shown);
      expect(back.ok, `"${shown}" (${d.id}=${v}) was rejected`).toBe(true);
      if (back.ok) {
        expect(
          Math.abs(back.value - v),
          `${d.id}: "${shown}" came back as ${back.value}, wanted ${v}`,
        ).toBeLessThanOrEqual(tolerance);
        expect(valueToNorm(d, back.value)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
