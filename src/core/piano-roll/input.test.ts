import { describe, expect, it } from 'vitest';
import { interpretKey, interpretWheel, wheelPixels, type KeyLike, type WheelLike } from './input';
import { ZOOM_STEP } from './viewport';

const PAGE = { width: 800, height: 400 };
const wheel = (over: Partial<WheelLike> = {}): WheelLike => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over });
const key = (k: string, over: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over });

describe('wheelPixels', () => {
  it('passes pixel deltas through and scales lines and pages', () => {
    expect(wheelPixels({ deltaX: 3, deltaY: 4, deltaMode: 0 }, PAGE)).toEqual({ dx: 3, dy: 4 });
    expect(wheelPixels({ deltaX: 1, deltaY: 2, deltaMode: 1 }, PAGE)).toEqual({ dx: 16, dy: 32 });
    expect(wheelPixels({ deltaX: 1, deltaY: 1, deltaMode: 2 }, PAGE)).toEqual({ dx: 800, dy: 400 });
  });
});

describe('interpretWheel', () => {
  it('does nothing for a zero wheel event', () => {
    expect(interpretWheel(wheel(), PAGE)).toBeNull();
  });
  it('scrolls on both axes for a plain wheel or trackpad', () => {
    expect(interpretWheel(wheel({ deltaX: 10, deltaY: 30 }), PAGE)).toEqual({ kind: 'scroll', dx: 10, dy: 30 });
  });
  it('turns Shift+wheel into sideways scrolling', () => {
    expect(interpretWheel(wheel({ deltaY: 40, shiftKey: true }), PAGE)).toEqual({ kind: 'scroll', dx: 40, dy: 0 });
  });
  it('keeps the sideways delta when the browser already swapped it for Shift', () => {
    expect(interpretWheel(wheel({ deltaX: 40, shiftKey: true }), PAGE)).toEqual({ kind: 'scroll', dx: 40, dy: 0 });
  });
  it('zooms time with Ctrl or Cmd: wheel up zooms in, down zooms out', () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
      const up = interpretWheel(wheel({ deltaY: -100, ...mod }), PAGE);
      const down = interpretWheel(wheel({ deltaY: 100, ...mod }), PAGE);
      expect(up).toMatchObject({ kind: 'zoom', axis: 'x' });
      expect((up as { factor: number }).factor).toBeGreaterThan(1);
      expect((down as { factor: number }).factor).toBeLessThan(1);
    }
  });
  it('zooms pitch with Alt', () => {
    expect(interpretWheel(wheel({ deltaY: -100, altKey: true }), PAGE)).toMatchObject({ kind: 'zoom', axis: 'y' });
  });
  it('treats Ctrl+Alt as time zoom (Ctrl wins)', () => {
    expect(interpretWheel(wheel({ deltaY: -100, altKey: true, ctrlKey: true }), PAGE)).toMatchObject({ kind: 'zoom', axis: 'x' });
  });
  it('zoom factors are symmetric and bounded', () => {
    const f = (dy: number) => (interpretWheel(wheel({ deltaY: dy, ctrlKey: true }), PAGE) as { factor: number }).factor;
    expect(f(100) * f(-100)).toBeCloseTo(1, 12);
    expect(f(1e6)).toBeGreaterThan(0);
    expect(f(-1e6)).toBeLessThanOrEqual(4);
  });
});

describe('interpretKey', () => {
  it('scrolls with the arrow keys, bigger steps with Shift', () => {
    expect(interpretKey(key('ArrowRight'), PAGE)).toEqual({ kind: 'scroll', dx: 48, dy: 0 });
    expect(interpretKey(key('ArrowLeft'), PAGE)).toEqual({ kind: 'scroll', dx: -48, dy: 0 });
    expect(interpretKey(key('ArrowUp'), PAGE)).toEqual({ kind: 'scroll', dx: 0, dy: -48 });
    expect(interpretKey(key('ArrowDown'), PAGE)).toEqual({ kind: 'scroll', dx: 0, dy: 48 });
    expect(interpretKey(key('ArrowDown', { shiftKey: true }), PAGE)).toEqual({ kind: 'scroll', dx: 0, dy: 240 });
  });
  it('scrolls most of a page with PageUp and PageDown', () => {
    expect(interpretKey(key('PageDown'), PAGE)).toEqual({ kind: 'scroll', dx: 0, dy: 360 });
    expect(interpretKey(key('PageUp'), PAGE)).toEqual({ kind: 'scroll', dx: 0, dy: -360 });
  });
  it('zooms time with + and - (with or without Shift, as on most layouts)', () => {
    expect(interpretKey(key('+', { shiftKey: true }), PAGE)).toEqual({ kind: 'zoom', axis: 'x', factor: ZOOM_STEP });
    expect(interpretKey(key('='), PAGE)).toEqual({ kind: 'zoom', axis: 'x', factor: ZOOM_STEP });
    expect(interpretKey(key('-'), PAGE)).toEqual({ kind: 'zoom', axis: 'x', factor: 1 / ZOOM_STEP });
  });
  it('zooms pitch with brackets', () => {
    expect(interpretKey(key(']'), PAGE)).toEqual({ kind: 'zoom', axis: 'y', factor: ZOOM_STEP });
    expect(interpretKey(key('['), PAGE)).toEqual({ kind: 'zoom', axis: 'y', factor: 1 / ZOOM_STEP });
  });
  it('fits with F', () => {
    expect(interpretKey(key('f'), PAGE)).toEqual({ kind: 'fit' });
    expect(interpretKey(key('F', { shiftKey: true }), PAGE)).toEqual({ kind: 'fit' });
  });
  it('leaves modified keys and everything else alone', () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(interpretKey(key('ArrowLeft', mod), PAGE)).toBeNull();
      expect(interpretKey(key('-', mod), PAGE)).toBeNull();
    }
    expect(interpretKey(key('a'), PAGE)).toBeNull();
    expect(interpretKey(key('Escape'), PAGE)).toBeNull();
    expect(interpretKey(key(' '), PAGE)).toBeNull();
  });
});
