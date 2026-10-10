import { describe, expect, it } from 'vitest';
import { ticksPerBar, type TimeSignature } from '../contracts/project';
import { MIN_LABEL_PX, MIN_LINE_PX, barLabelStep, beatTicks, gridLines, loopSpan, subdivisionChain } from './grid';

const S44: TimeSignature = { numerator: 4, denominator: 4 };
const S34: TimeSignature = { numerator: 3, denominator: 4 };
const S68: TimeSignature = { numerator: 6, denominator: 8 };

describe('beat and subdivision tables', () => {
  it('uses quarter notes in x/4 and dotted quarters in 6/8', () => {
    expect(beatTicks(S44)).toBe(960);
    expect(beatTicks(S34)).toBe(960);
    expect(beatTicks(S68)).toBe(1440);
  });
  it('every level divides the previous one and the bar', () => {
    for (const sig of [S44, S34, S68]) {
      const chain = subdivisionChain(sig);
      expect(chain[0]).toBe(beatTicks(sig));
      chain.forEach((t, i) => {
        expect(ticksPerBar(sig) % t).toBe(0);
        if (i > 0) expect(chain[i - 1]! % t).toBe(0);
      });
    }
  });
});

describe('gridLines', () => {
  it('draws bars, beats and 16ths in 4/4 at the default zoom', () => {
    // 0.1 px/tick: a 32nd note (120 ticks) is 12 px ≥ 10, so lines run every 32nd
    const lines = gridLines(S44, 0, 3840, 0.1);
    expect(lines.filter((l) => l.kind === 'bar').map((l) => l.tick)).toEqual([0, 3840]);
    expect(lines.filter((l) => l.kind === 'beat').map((l) => l.tick)).toEqual([960, 1920, 2880]);
    expect(lines.filter((l) => l.kind === 'sub').length).toBe(28); // 33 lines (every 120 ticks) minus 2 bars and 3 beats
  });

  it('has lines in ascending order, each tick once', () => {
    const lines = gridLines(S44, 0, 20000, 0.1);
    for (let i = 1; i < lines.length; i++) expect(lines[i]!.tick).toBeGreaterThan(lines[i - 1]!.tick);
  });

  it('never packs lines closer than MIN_LINE_PX', () => {
    for (const sig of [S44, S34, S68]) {
      for (const px of [0.004, 0.01, 0.03, 0.05, 0.1, 0.2, 0.5]) {
        const lines = gridLines(sig, 0, 40000, px);
        for (let i = 1; i < lines.length; i++) {
          expect((lines[i]!.tick - lines[i - 1]!.tick) * px, `${sig.numerator}/${sig.denominator} @ ${px}`).toBeGreaterThanOrEqual(MIN_LINE_PX - 1e-9);
        }
      }
    }
  });

  it('thins out as you zoom out: sub lines first, then beats, leaving bars', () => {
    const kinds = (px: number) => new Set(gridLines(S44, 0, 8 * 3840, px).map((l) => l.kind));
    expect(kinds(0.5)).toEqual(new Set(['bar', 'beat', 'sub']));
    expect(kinds(0.02)).toEqual(new Set(['bar', 'beat'])); // 480 ticks = 9.6 px < 10, beat = 19.2 px
    expect(kinds(0.008)).toEqual(new Set(['bar'])); // beat = 7.7 px
  });

  it('resolves down to 32nd notes only when zoomed in far enough', () => {
    const per = (px: number) => gridLines(S44, 0, 960, px).filter((l) => l.tick < 960).length;
    expect(per(0.09)).toBe(8); // 32nd = 10.8 px → every 120 ticks
    expect(per(0.08)).toBe(4); // 32nd = 9.6 px, 16th = 19.2 px → every 240 ticks
    expect(per(0.025)).toBe(2); // 16th = 6 px, 8th = 12 px → every 480 ticks
    expect(per(0.015)).toBe(1); // 8th = 7.2 px, beat = 14.4 px → beats only
  });

  it('marks 3/4 bars after three beats', () => {
    const lines = gridLines(S34, 0, 2880 * 2, 0.05);
    expect(lines.filter((l) => l.kind === 'bar').map((l) => l.tick)).toEqual([0, 2880, 5760]);
    expect(lines.filter((l) => l.kind === 'beat').map((l) => l.tick)).toEqual([960, 1920, 3840, 4800]);
  });

  it('puts one main beat in the middle of a 6/8 bar and eighths either side', () => {
    const lines = gridLines(S68, 0, 2880, 0.05); // eighth = 24 px, 16th = 12 px
    expect(lines.filter((l) => l.kind === 'bar').map((l) => l.tick)).toEqual([0, 2880]);
    expect(lines.filter((l) => l.kind === 'beat').map((l) => l.tick)).toEqual([1440]);
    expect(lines.find((l) => l.tick === 480)?.kind).toBe('sub');
  });

  it('only returns lines inside the requested window', () => {
    const lines = gridLines(S44, 1000, 5000, 0.1);
    expect(lines[0]!.tick).toBeGreaterThanOrEqual(1000);
    expect(lines.at(-1)!.tick).toBeLessThanOrEqual(5000);
  });

  it('includes a line exactly on either edge', () => {
    const lines = gridLines(S44, 960, 3840, 0.1);
    expect(lines[0]!.tick).toBe(960);
    expect(lines.at(-1)!.tick).toBe(3840);
  });

  it('never starts before tick 0', () => {
    const lines = gridLines(S44, -5000, 2000, 0.1);
    expect(lines[0]!.tick).toBe(0);
  });

  it('reports the bar each line belongs to', () => {
    const lines = gridLines(S44, 3840, 3840 * 2 + 960, 0.1);
    expect(lines.find((l) => l.tick === 3840)).toMatchObject({ kind: 'bar', bar: 1 });
    expect(lines.find((l) => l.tick === 3840 + 960)).toMatchObject({ kind: 'beat', bar: 1 });
    expect(lines.find((l) => l.tick === 7680)).toMatchObject({ kind: 'bar', bar: 2 });
  });

  it('is bounded: a 64-bar song at the widest zoom-out draws only a few hundred lines', () => {
    expect(gridLines(S44, 0, 64 * 3840, 0.004).length).toBe(65);
    expect(gridLines(S44, 0, 64 * 3840, 0.01).length).toBeLessThan(400);
  });
});

describe('barLabelStep', () => {
  it('labels every bar when bars are wide', () => {
    expect(barLabelStep(S44, 0.1)).toBe(1); // 384 px per bar
  });
  it('doubles the step until labels have room', () => {
    for (const px of [0.004, 0.006, 0.01, 0.02, 0.05]) {
      const n = barLabelStep(S44, px);
      expect(n * 3840 * px).toBeGreaterThanOrEqual(MIN_LABEL_PX);
      expect(Math.log2(n) % 1).toBe(0);
      if (n > 1) expect((n / 2) * 3840 * px).toBeLessThan(MIN_LABEL_PX);
    }
  });
});

describe('loopSpan', () => {
  it('converts bars to ticks with the time signature', () => {
    expect(loopSpan({ enabled: true, startBar: 1, endBar: 3 }, S44)).toEqual({ startTick: 3840, endTick: 11520 });
    expect(loopSpan({ enabled: false, startBar: 0, endBar: 2 }, S34)).toEqual({ startTick: 0, endTick: 5760 });
    expect(loopSpan({ enabled: true, startBar: 2, endBar: 4 }, S68)).toEqual({ startTick: 5760, endTick: 11520 });
  });
});
