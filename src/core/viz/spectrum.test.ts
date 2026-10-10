import { describe, expect, it } from 'vitest';
import { binsToColumns, dbToY, freqToX, spectrumGrid, visibleLabels, xToFreq } from './spectrum';

describe('log frequency axis', () => {
  it('maps the ends and a decade evenly', () => {
    expect(freqToX(20)).toBe(0);
    expect(freqToX(20000)).toBe(1);
    expect(freqToX(200) - freqToX(20)).toBeCloseTo(freqToX(2000) - freqToX(200), 10);
    expect(freqToX(2000) - freqToX(200)).toBeCloseTo(freqToX(20000) - freqToX(2000), 10);
  });
  it('round-trips and clamps', () => {
    for (const hz of [20, 55, 440, 5000, 20000]) expect(xToFreq(freqToX(hz))).toBeCloseTo(hz, 6);
    expect(freqToX(5)).toBe(0);
    expect(freqToX(1e6)).toBe(1);
  });
  it('octaves are equally spaced', () => {
    expect(freqToX(880) - freqToX(440)).toBeCloseTo(freqToX(440) - freqToX(220), 10);
  });
});

describe('dbToY', () => {
  it('scales between the floor and the ceiling and treats −∞ as the floor', () => {
    expect(dbToY(-100)).toBe(0);
    expect(dbToY(-20)).toBe(1);
    expect(dbToY(-60)).toBeCloseTo(0.5, 10);
    expect(dbToY(-Infinity)).toBe(0);
    expect(dbToY(10)).toBe(1);
  });
});

describe('binsToColumns', () => {
  const SR = 48000;
  const N = 1024;
  const spectrum = (peakHz: number) => {
    const db = new Float32Array(N).fill(-100);
    db[Math.round(peakHz / (SR / 2 / N))] = -10;
    return db;
  };

  it('puts a harmonic at the column for its frequency', () => {
    for (const hz of [100, 440, 3000, 12000]) {
      const cols = binsToColumns(spectrum(hz), SR, 400);
      const peakCol = cols.indexOf(Math.max(...cols));
      expect(Math.abs(peakCol / 400 - freqToX(hz)), `${hz} Hz`).toBeLessThan(0.02);
    }
  });

  it('keeps narrow peaks at high frequencies (max, not average)', () => {
    const cols = binsToColumns(spectrum(15000), SR, 100);
    expect(Math.max(...cols)).toBeCloseTo(-10, 5);
  });

  it('is continuous at low frequencies where one bin spans several columns', () => {
    const flat = new Float32Array(N).fill(-50);
    const cols = binsToColumns(flat, SR, 300);
    for (const c of cols.slice(0, 40)) expect(c).toBeCloseTo(-50, 5);
  });

  it('handles an all −∞ analyser (silence) without NaN', () => {
    const cols = binsToColumns(new Float32Array(N).fill(-Infinity), SR, 50);
    expect([...cols].every((c) => c === -Infinity)).toBe(true);
  });
});

describe('spectrumGrid', () => {
  it('has labelled octave Cs and decade marks, sorted left to right', () => {
    const g = spectrumGrid();
    const labels = g.map((l) => l.label);
    expect(labels).toContain('C2');
    expect(labels).toContain('C7');
    expect(labels).toContain('100');
    expect(labels).toContain('1k');
    expect(labels).toContain('10k');
    expect(g.map((l) => l.x)).toEqual([...g.map((l) => l.x)].sort((a, b) => a - b));
    expect(g.every((l) => l.x >= 0 && l.x <= 1)).toBe(true);
  });
});

describe('visibleLabels', () => {
  const grid = spectrumGrid();
  const overlaps = (kept: ReturnType<typeof visibleLabels>, w: number) => {
    const spans = [...kept].map((g) => [g.x * w, g.x * w + Math.max(24, g.label.length * 6.5)] as const).sort((a, b) => a[0] - b[0]);
    return spans.some((s, i) => i > 0 && s[0] < spans[i - 1]![1]);
  };
  it('never lets two labels overlap, at any plot width', () => {
    for (const w of [200, 300, 440, 800]) expect(overlaps(visibleLabels(grid, w), w), `width ${w}`).toBe(false);
  });
  it('keeps the decade marks and drops note names first when space is tight', () => {
    const kept = visibleLabels(grid, 300);
    for (const l of ['100', '1k', '10k']) expect([...kept].some((g) => g.label === l), l).toBe(true);
    expect(kept.size).toBeLessThan(grid.length);
  });
  it('shows more labels when there is more room', () => {
    expect(visibleLabels(grid, 900).size).toBeGreaterThan(visibleLabels(grid, 300).size);
  });
});
