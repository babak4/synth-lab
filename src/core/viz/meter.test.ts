import { describe, expect, it } from 'vitest';
import { FALL_DB_PER_S, HOLD_SECONDS, METER_FLOOR_DB, initialMeter, meterFraction, stepMeter } from './meter';

describe('meter ballistics', () => {
  it('attacks instantly and falls at a steady rate', () => {
    let m = stepMeter(initialMeter(), 0.5, 0.016);
    expect(m.levelDb).toBeCloseTo(-6.02, 1);
    m = stepMeter(m, 0, 0.5);
    expect(m.levelDb).toBeCloseTo(-6.02 - FALL_DB_PER_S * 0.5, 1);
  });

  it('never falls below the floor', () => {
    let m = stepMeter(initialMeter(), 1, 0.016);
    for (let i = 0; i < 1000; i++) m = stepMeter(m, 0, 0.1);
    expect(m.levelDb).toBe(METER_FLOOR_DB);
    expect(m.holdDb).toBe(METER_FLOOR_DB);
  });

  it('holds the peak marker for a moment, then lets it fall', () => {
    let m = stepMeter(initialMeter(), 1, 0.016);
    expect(m.holdDb).toBeCloseTo(0, 5);
    m = stepMeter(m, 0, HOLD_SECONDS * 0.9);
    expect(m.holdDb).toBeCloseTo(0, 5);
    m = stepMeter(m, 0, 0.5);
    m = stepMeter(m, 0, 0.5);
    expect(m.holdDb).toBeLessThan(0);
  });

  it('a new higher peak resets the hold', () => {
    let m = stepMeter(initialMeter(), 0.1, 0.016);
    m = stepMeter(m, 0, 1);
    m = stepMeter(m, 0.9, 0.016);
    expect(m.holdAge).toBe(0);
    expect(m.holdDb).toBeCloseTo(-0.9, 1);
  });

  it('maps dB to a 0–1 bar', () => {
    expect(meterFraction(0)).toBe(1);
    expect(meterFraction(-60)).toBe(0);
    expect(meterFraction(-30)).toBeCloseTo(0.5, 10);
    expect(meterFraction(6)).toBe(1);
  });
});
