/**
 * Pure interaction maths shared by Knob and Slider (plan T0.3): drag, wheel and keyboard
 * all work in normalised 0–1 position so log/exp scales feel even across their range.
 */
import { normToValue, quantise, stepCount, valueToNorm } from '@/core/params/scale';
import type { ContinuousParamDef } from '@/core/params/types';

/** Pixels of vertical drag for a full 0→1 sweep. */
export const DRAG_RANGE_PX = 180;
export const FINE_FACTOR = 0.1;
const KEY_NORM_STEP = 0.02;
const KEY_NORM_FINE = 0.005;
const KEY_NORM_PAGE = 0.1;
const WHEEL_NORM_STEP = 0.02;

/** Dragging up (negative dy in screen space) increases the value. */
export function dragValue(def: ContinuousParamDef, startValue: number, dyPx: number, fine: boolean): number {
  const start = valueToNorm(def, startValue);
  const delta = (-dyPx / DRAG_RANGE_PX) * (fine ? FINE_FACTOR : 1);
  return normToValue(def, start + delta);
}

/** Step the value by `direction` (±1) of `size` normalised units, or by whole steps on stepped controls. */
function nudge(def: ContinuousParamDef, value: number, direction: 1 | -1, norm: number, minSteps = 1): number {
  const steps = stepCount(def);
  if (steps !== null) {
    const stepsToMove = Math.max(minSteps, Math.round(norm * (steps - 1)));
    return quantise(def, value + direction * stepsToMove * def.step);
  }
  const next = normToValue(def, valueToNorm(def, value) + direction * norm);
  return next;
}

/** Returns the new value for a key press, or null if the key is not handled. */
export function keyValue(def: ContinuousParamDef, value: number, key: string, shift: boolean): number | null {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return nudge(def, value, 1, shift ? KEY_NORM_FINE : KEY_NORM_STEP);
    case 'ArrowDown':
    case 'ArrowLeft':
      return nudge(def, value, -1, shift ? KEY_NORM_FINE : KEY_NORM_STEP);
    case 'PageUp':
      return nudge(def, value, 1, KEY_NORM_PAGE);
    case 'PageDown':
      return nudge(def, value, -1, KEY_NORM_PAGE);
    case 'Home':
      return def.min;
    case 'End':
      return def.max;
    default:
      return null;
  }
}

/** Wheel up (negative deltaY) increases the value. */
export function wheelValue(def: ContinuousParamDef, value: number, deltaY: number, shift: boolean): number {
  const dir = deltaY < 0 ? 1 : -1;
  return nudge(def, value, dir, shift ? KEY_NORM_FINE : WHEEL_NORM_STEP);
}

/** Knob arc sweep: 270° from −135° to +135° (0° = straight up). */
export const KNOB_START_DEG = -135;
export const KNOB_SWEEP_DEG = 270;

export function knobAngle(norm: number): number {
  return KNOB_START_DEG + norm * KNOB_SWEEP_DEG;
}

/** Polar point for SVG (0° = up, clockwise). */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG arc path from `fromDeg` to `toDeg` (clockwise). */
export function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** Slider position helpers: the native range input works in 0–1 (or in step indices when stepped). */
export function sliderAttrs(def: ContinuousParamDef): { max: number; step: number | 'any' } {
  const steps = stepCount(def);
  return steps !== null ? { max: steps - 1, step: 1 } : { max: 1, step: 'any' };
}

export function sliderPosition(def: ContinuousParamDef, value: number): number {
  const steps = stepCount(def);
  const norm = valueToNorm(def, value);
  return steps !== null ? Math.round(norm * (steps - 1)) : norm;
}

export function sliderValue(def: ContinuousParamDef, position: number): number {
  const steps = stepCount(def);
  return normToValue(def, steps !== null ? position / (steps - 1) : position);
}
