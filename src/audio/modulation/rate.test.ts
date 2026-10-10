import { describe, expect, it } from 'vitest';
import { divisionBeats, effectiveRateHz, syncedRateHz, syncedSeconds } from './rate';

describe('tempo sync', () => {
  it('division lengths in beats', () => {
    expect(['1/1', '1/2', '1/4', '1/8', '1/16', '1/32'].map((d) => divisionBeats(d as never))).toEqual([4, 2, 1, 0.5, 0.25, 0.125]);
  });

  it.each([
    [60, '1/4', 1],
    [120, '1/4', 2],
    [180, '1/4', 3],
    [120, '1/8', 4],
    [120, '1/1', 0.5],
    [60, '1/16', 4],
    [180, '1/32', 24],
  ])('at %i BPM, %s is %f Hz', (bpm, div, hz) => {
    expect(syncedRateHz(bpm, div as never)).toBeCloseTo(hz, 9);
  });

  it('delay times: a quarter at 120 BPM is 500 ms, a dotted-free eighth 250 ms', () => {
    expect(syncedSeconds(120, '1/4')).toBeCloseTo(0.5, 9);
    expect(syncedSeconds(120, '1/8')).toBeCloseTo(0.25, 9);
    expect(syncedSeconds(60, '1/1')).toBeCloseTo(4, 9);
  });

  it('sync wins over the free rate; otherwise the free rate is used', () => {
    expect(effectiveRateHz({ sync: true, rateHz: 7, division: '1/4', bpm: 120 })).toBe(2);
    expect(effectiveRateHz({ sync: false, rateHz: 7, division: '1/4', bpm: 120 })).toBe(7);
  });
});
