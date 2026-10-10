import { describe, expect, it } from 'vitest';
import { LN_1000 as ENGINE_LN } from '@/audio/voice/envelope';
import type { VoiceState } from '../contracts/engine';
import { effectiveCutoffHz, envelopeDot, envelopeLayout, envelopePoints, lfoMarker, lfoPoints, type EnvShape, type FilterParams } from './plots';

const voice = (over: Partial<VoiceState> = {}): VoiceState => ({
  id: 1, pitch: 60, velocity: 100, held: true, lfoPhase: 0,
  amp: { stage: 'sustain', elapsed: 1, level: 0.8 },
  filter: { stage: 'sustain', elapsed: 1, level: 0 },
  ...over,
});
const fp = (o: Partial<FilterParams> = {}): FilterParams => ({ cutoff: 1000, envAmount: 0, keyTracking: 0, lfoDestination: 'cutoff', lfoDepth: 0, lfoShape: 'sine', ...o });

describe('effectiveCutoffHz', () => {
  it('is the set cutoff with no voice or no modulation', () => {
    expect(effectiveCutoffHz(fp(), null, 0.3)).toBe(1000);
    expect(effectiveCutoffHz(fp(), voice(), 0.3)).toBeCloseTo(1000, 6);
  });
  it('the envelope moves it exponentially: +100% at full level is six octaves up', () => {
    const v = voice({ filter: { stage: 'attack', elapsed: 0, level: 1 } });
    expect(effectiveCutoffHz(fp({ cutoff: 200, envAmount: 1 }), v, 0)).toBeCloseTo(200 * 64, 3);
    expect(effectiveCutoffHz(fp({ cutoff: 8000, envAmount: -0.5 }), v, 0)).toBeCloseTo(8000 / 8, 3);
  });
  it('key tracking follows pitch relative to C4', () => {
    expect(effectiveCutoffHz(fp({ keyTracking: 1 }), voice({ pitch: 72 }), 0)).toBeCloseTo(2000, 3);
    expect(effectiveCutoffHz(fp({ keyTracking: 0.5 }), voice({ pitch: 72 }), 0)).toBeCloseTo(1000 * Math.SQRT2, 3);
  });
  it('the LFO swings it ±depth×4 octaves, only when it targets the cutoff', () => {
    expect(effectiveCutoffHz(fp({ lfoDepth: 0.5 }), voice(), 0.25)).toBeCloseTo(1000 * 4, 3); // +2 octaves at the sine peak
    expect(effectiveCutoffHz(fp({ lfoDepth: 0.5 }), voice(), 0.75)).toBeCloseTo(250, 3);
    expect(effectiveCutoffHz(fp({ lfoDepth: 0.5, lfoDestination: 'pitch' }), voice(), 0.25)).toBeCloseTo(1000, 6);
  });
  it('stays inside 20 Hz … Nyquist', () => {
    const v = voice({ filter: { stage: 'attack', elapsed: 0, level: 1 } });
    expect(effectiveCutoffHz(fp({ cutoff: 15000, envAmount: 1 }), v, 0)).toBe(24000);
    expect(effectiveCutoffHz(fp({ cutoff: 25, envAmount: -1 }), v, 0)).toBe(20);
  });
});

const shape: EnvShape = { attack: 0.05, decay: 0.4, sustain: 0.6, release: 1.2 };

describe('envelope plot', () => {
  it('layout fractions sum to one and every stage is visible, even for 1 ms stages', () => {
    for (const s of [shape, { attack: 0.001, decay: 0.001, sustain: 1, release: 0.001 }, { attack: 5, decay: 5, sustain: 0, release: 10 }]) {
      const L = envelopeLayout(s);
      expect(L.attack + L.decay + L.hold + L.release).toBeCloseTo(1, 10);
      for (const v of [L.attack, L.decay, L.hold, L.release]) expect(v).toBeGreaterThan(0.05);
    }
  });

  it('longer stages get wider', () => {
    const a = envelopeLayout({ ...shape, attack: 0.01 });
    const b = envelopeLayout({ ...shape, attack: 2 });
    expect(b.attack).toBeGreaterThan(a.attack);
  });

  it('draws 0 → peak → sustain → ~0, left to right, within the unit square', () => {
    const pts = envelopePoints(shape);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts.find((p) => p.y === 1)!.x).toBeCloseTo(envelopeLayout(shape).attack, 10);
    expect(pts.at(-1)!.x).toBeCloseTo(1, 10);
    expect(pts.at(-1)!.y).toBeCloseTo(0.6 / 1000, 6);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.x).toBeGreaterThanOrEqual(pts[i - 1]!.x);
    expect(pts.every((p) => p.x >= 0 && p.x <= 1 + 1e-9 && p.y >= 0 && p.y <= 1 + 1e-9)).toBe(true);
  });

  it('uses the same 60 dB time constant as the engine', () => {
    // decay/release: after the stated time, 1/1000 of the distance remains
    expect(ENGINE_LN).toBe(Math.log(1000));
    const pts = envelopePoints(shape, 50);
    const endOfDecay = pts.find((p) => Math.abs(p.x - (envelopeLayout(shape).attack + envelopeLayout(shape).decay)) < 1e-9)!;
    expect(endOfDecay.y).toBeCloseTo(0.6 + 0.4 / 1000, 6);
  });

  it('a voice dot lies ON the drawn curve in every stage', () => {
    const L = envelopeLayout(shape);
    const curveY = (x: number) => {
      const pts = envelopePoints(shape, 200);
      const i = pts.findIndex((p) => p.x >= x);
      if (i <= 0) return pts[0]!.y;
      const [a, b] = [pts[i - 1]!, pts[i]!];
      return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    };
    const levelAt = (stage: string, t: number): number =>
      stage === 'attack' ? t / shape.attack
      : stage === 'decay' ? shape.sustain + (1 - shape.sustain) * Math.exp((-t / shape.decay) * ENGINE_LN)
      : stage === 'release' ? shape.sustain * Math.exp((-t / shape.release) * ENGINE_LN)
      : shape.sustain;
    const cases = [
      ['attack', 0.02], ['attack', 0.05], ['decay', 0.1], ['decay', 0.4], ['release', 0.3], ['release', 1.2],
    ] as const;
    for (const [stage, t] of cases) {
      const dot = envelopeDot(shape, { stage, elapsed: t, level: levelAt(stage, t) * 0.8 }, 0.8);
      expect(Math.abs(dot.y - curveY(dot.x)), `${stage}@${t}`).toBeLessThan(0.01);
    }
    expect(envelopeDot(shape, { stage: 'attack', elapsed: 0.05, level: 0.8 }, 0.8).x).toBeCloseTo(L.attack, 10);
  });

  it('a sustaining dot stays in the hold segment and a quiet note rides the same curve', () => {
    const L = envelopeLayout(shape);
    const d = envelopeDot(shape, { stage: 'sustain', elapsed: 100, level: 0.3 }, 0.5);
    expect(d.x).toBeGreaterThan(L.attack + L.decay);
    expect(d.x).toBeLessThan(L.attack + L.decay + L.hold);
    expect(d.y).toBe(0.6);
    const quiet = envelopeDot(shape, { stage: 'decay', elapsed: 0.1, level: 0.25 }, 0.5); // level/peak = 0.5
    const loud = envelopeDot(shape, { stage: 'decay', elapsed: 0.1, level: 0.5 }, 1);
    expect(quiet).toEqual(loud);
  });
});

describe('LFO plot', () => {
  it('draws one closed cycle in the unit square for every shape', () => {
    for (const s of ['sine', 'triangle', 'sawtooth', 'square', 'sample-hold'] as const) {
      const pts = lfoPoints(s);
      expect(pts[0]!.x).toBe(0);
      expect(pts.at(-1)!.x).toBe(1);
      expect(pts.every((p) => p.y >= 0 && p.y <= 1)).toBe(true);
    }
  });
  it('the marker sits on the curve and wraps with phase', () => {
    const m = lfoMarker('sine', 0.25);
    expect(m).toEqual({ x: 0.25, y: 1 });
    expect(lfoMarker('sine', 1.25).x).toBeCloseTo(0.25, 10);
    expect(lfoMarker('square', 0.1).y).toBe(1);
    expect(lfoMarker('square', 0.6).y).toBe(0);
  });
});
