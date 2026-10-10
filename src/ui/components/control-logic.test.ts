import { describe, expect, it } from 'vitest';
import { getParamDef } from '@/core/params/registry';
import type { ContinuousParamDef } from '@/core/params/types';
import { normToValue, valueToNorm } from '@/core/params/scale';
import { DRAG_RANGE_PX, arcPath, dragValue, keyValue, knobAngle, sliderAttrs, sliderPosition, sliderValue, wheelValue } from './control-logic';

const def = (id: Parameters<typeof getParamDef>[0]) => getParamDef(id) as ContinuousParamDef;

describe('log-scale value ↔ position mapping', () => {
  const cutoff = def('filter-cutoff');
  it('places each decade at equal knob distance', () => {
    const n200 = valueToNorm(cutoff, 200);
    const n2000 = valueToNorm(cutoff, 2000);
    const n20000 = valueToNorm(cutoff, 20000);
    expect(n2000 - n200).toBeCloseTo(n20000 - n2000, 10);
  });
  it('maps 632 Hz (geometric mean of 20 and 20k) to the centre', () => {
    expect(valueToNorm(cutoff, Math.sqrt(20 * 20000))).toBeCloseTo(0.5, 10);
    expect(normToValue(cutoff, 0.5)).toBeCloseTo(632.455, 2);
  });
});

describe('dragValue', () => {
  const cutoff = def('filter-cutoff');
  it('a full-height upward drag sweeps the whole range', () => {
    expect(dragValue(cutoff, 20, -DRAG_RANGE_PX, false)).toBeCloseTo(20000, 0);
  });
  it('dragging down decreases and clamps at min', () => {
    expect(dragValue(cutoff, 20, 500, false)).toBe(20);
    expect(dragValue(cutoff, 1000, 20, false)).toBeLessThan(1000);
  });
  it('shift gives 10× finer resolution', () => {
    const coarse = dragValue(def('mix-osc-a'), 0.5, -18, false) - 0.5;
    const fine = dragValue(def('mix-osc-a'), 0.5, -18, true) - 0.5;
    expect(fine / coarse).toBeCloseTo(0.1, 5);
  });
  it('stepped controls snap to integers', () => {
    const oct = def('osc-a-octave');
    expect(Number.isInteger(dragValue(oct, 0, -37, false))).toBe(true);
  });
});

describe('keyValue', () => {
  it('arrows move ±2% of travel on continuous controls; shift is finer', () => {
    const m = def('mix-osc-a');
    expect(keyValue(m, 0.5, 'ArrowUp', false)).toBeCloseTo(0.52, 6);
    expect(keyValue(m, 0.5, 'ArrowDown', false)).toBeCloseTo(0.48, 6);
    expect(keyValue(m, 0.5, 'ArrowRight', true)).toBeCloseTo(0.505, 6);
  });
  it('arrows move exactly one step on stepped controls', () => {
    expect(keyValue(def('osc-a-octave'), 0, 'ArrowUp', false)).toBe(1);
    expect(keyValue(def('osc-a-octave'), 2, 'ArrowUp', false)).toBe(2);
    expect(keyValue(def('voice-count'), 8, 'ArrowDown', false)).toBe(7);
    expect(keyValue(def('filter-key-tracking'), 0, 'ArrowUp', false)).toBe(0.5);
  });
  it('Home/End jump to the extremes and unknown keys are ignored', () => {
    expect(keyValue(def('filter-cutoff'), 500, 'Home', false)).toBe(20);
    expect(keyValue(def('filter-cutoff'), 500, 'End', false)).toBe(20000);
    expect(keyValue(def('filter-cutoff'), 500, 'a', false)).toBeNull();
  });
  it('PageUp moves further than an arrow', () => {
    const m = def('mix-osc-a');
    expect(keyValue(m, 0.5, 'PageUp', false)! - 0.5).toBeGreaterThan(keyValue(m, 0.5, 'ArrowUp', false)! - 0.5);
  });
});

describe('wheelValue', () => {
  it('scrolling up increases, down decreases', () => {
    const m = def('mix-osc-a');
    expect(wheelValue(m, 0.5, -100, false)).toBeGreaterThan(0.5);
    expect(wheelValue(m, 0.5, 100, false)).toBeLessThan(0.5);
  });
});

describe('slider mapping', () => {
  it('round-trips continuous and stepped controls', () => {
    for (const id of ['amp-env-attack', 'osc-a-octave', 'voice-count', 'filter-key-tracking'] as const) {
      const d = def(id);
      for (const v of [d.min, d.default, d.max]) {
        expect(sliderValue(d, sliderPosition(d, v)), id).toBeCloseTo(v, 6);
      }
    }
  });
  it('stepped controls expose integer positions', () => {
    expect(sliderAttrs(def('osc-a-octave'))).toEqual({ max: 4, step: 1 });
    expect(sliderAttrs(def('filter-cutoff'))).toEqual({ max: 1, step: 'any' });
  });
});

describe('knob geometry', () => {
  it('sweeps 270° centred on 12 o’clock', () => {
    expect(knobAngle(0)).toBe(-135);
    expect(knobAngle(0.5)).toBe(0);
    expect(knobAngle(1)).toBe(135);
  });
  it('arcs longer than 180° use the large-arc flag', () => {
    expect(arcPath(24, 24, 19, -135, 135)).toMatch(/A 19 19 0 1 1/);
    expect(arcPath(24, 24, 19, -135, -45)).toMatch(/A 19 19 0 0 1/);
  });
});
