import { useEffect, useRef } from 'react';
import { subscribeFrames } from './raf-loop';

export interface Colours {
  bg: string;
  grid: string;
  gridStrong: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  danger: string;
}

/** Read the theme tokens from CSS so canvases follow light/dark without duplicating colour values. */
export function readColours(): Colours {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim() || '#888';
  return {
    bg: v('--surface-2'),
    grid: v('--border'),
    gridStrong: v('--text-muted'),
    text: v('--text'),
    muted: v('--text-muted'),
    accent: v('--accent'),
    accentSoft: v('--accent-soft'),
    danger: v('--danger'),
  };
}

export interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. */
  width: number;
  height: number;
  dt: number;
  colours: Colours;
}

/**
 * A DPR-aware canvas redrawn from the shared frame loop. The returned ref goes on a <canvas>.
 * Colours are re-read when the theme changes.
 */
export function useCanvas(draw: (a: DrawArgs) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw; // eslint-disable-line react-hooks/refs

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let colours = readColours();
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const w = Math.max(1, Math.round(width * dpr));
      const h = Math.max(1, Math.round(height * dpr));
      // Assigning width or height clears the bitmap even when the value is the same, so only do it on a real change
      // (the observer's first callback would otherwise wipe a frame that a draw-on-change canvas will not repaint).
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const refreshColours = () => (colours = readColours());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', refreshColours);
    const mo = new MutationObserver(refreshColours);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const unsubscribe = subscribeFrames((dt) => drawRef.current({ ctx, width, height, dt, colours }));
    return () => {
      unsubscribe();
      ro.disconnect();
      mq.removeEventListener('change', refreshColours);
      mo.disconnect();
    };
  }, []);

  return ref;
}
