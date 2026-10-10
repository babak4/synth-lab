import { describe, expect, it } from 'vitest';
import { PPQ } from './contracts/project';
import { barBeatAt, clickTicks, formatBarBeat, loopTicks, secondsToTicks, songEndTick, ticksToSeconds } from './transport';

const s44 = { numerator: 4, denominator: 4 } as const;
const s34 = { numerator: 3, denominator: 4 } as const;
const s68 = { numerator: 6, denominator: 8 } as const;

describe('tick / seconds', () => {
  it('a quarter note at 120 BPM is half a second', () => {
    expect(ticksToSeconds(PPQ, 120)).toBeCloseTo(0.5, 12);
    expect(ticksToSeconds(PPQ * 4, 60)).toBeCloseTo(4, 12);
  });
  it('round-trips', () => {
    for (const bpm of [40, 73.5, 120, 133.33, 240]) {
      for (const t of [0, 1, 240, 3840, 123_457]) expect(secondsToTicks(ticksToSeconds(t, bpm), bpm)).toBeCloseTo(t, 6);
    }
  });
});

describe('song and loop ticks', () => {
  it('song end follows the signature', () => {
    expect(songEndTick(8, s44)).toBe(8 * 3840);
    expect(songEndTick(2, s34)).toBe(2 * 2880);
    expect(songEndTick(2, s68)).toBe(2 * 2880);
  });
  it('loop region is null when off, bar-aligned when on', () => {
    expect(loopTicks({ enabled: false, startBar: 0, endBar: 4 }, s44)).toBeNull();
    expect(loopTicks({ enabled: true, startBar: 1, endBar: 3 }, s44)).toEqual({ start: 3840, end: 11520 });
  });
});

describe('metronome pulse and readout', () => {
  it('clicks per beat, or per dotted quarter in 6/8', () => {
    expect(clickTicks(s44)).toBe(960);
    expect(clickTicks(s34)).toBe(960);
    expect(clickTicks(s68)).toBe(1440);
  });
  it('formats bar.beat, 1-based', () => {
    expect(barBeatAt(0, s44)).toEqual({ bar: 1, beat: 1, tick: 0 });
    expect(formatBarBeat(3840 + 960 * 2 + 5, s44)).toBe('2.3');
    expect(formatBarBeat(2880 + 1440, s68)).toBe('2.2');
    expect(formatBarBeat(-50, s44)).toBe('1.1');
  });
});
