import { useCallback, useEffect, useRef, type PointerEvent } from 'react';
import { useServices } from '@/app/context';
import { yToPitch, type Viewport } from '@/core/piano-roll';
import { KEY_WIDTH, RULER_HEIGHT } from './draw';

/**
 * Press a key in the piano column to hear it (like the on-screen keyboard, including glissando).
 * Notes go out on the bus with source "audition", so the selected track's engine plays them.
 */
export function useAudition(getViewport: () => Viewport) {
  const { bus, host, appStore, startAudio } = useServices();
  const held = useRef(new Map<number, number>()); // pointerId → pitch

  const start = useCallback(
    (id: number, pitch: number) => {
      held.current.set(id, pitch);
      if (appStore.getState().audio === 'off') void startAudio(); // a click is a user gesture
      bus.emit('note:on', { pitch, velocity: appStore.getState().kbdVelocity, source: 'audition', audioTime: host.currentTime });
    },
    [bus, host, appStore, startAudio],
  );
  const end = useCallback(
    (id: number) => {
      const pitch = held.current.get(id);
      if (pitch === undefined) return;
      held.current.delete(id);
      bus.emit('note:off', { pitch, source: 'audition', audioTime: host.currentTime });
    },
    [bus, host],
  );

  // Never leave a note ringing if the roll goes away mid-press.
  useEffect(() => {
    const map = held.current;
    return () => [...map.keys()].forEach(end);
  }, [end]);

  const pitchAt = (e: PointerEvent<HTMLElement>): number | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < 0 || x >= KEY_WIDTH || y < RULER_HEIGHT || y > r.height) return null;
    return yToPitch(getViewport(), y - RULER_HEIGHT);
  };

  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const pitch = pitchAt(e);
      if (pitch === null) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture can throw for synthesised pointers; the note must still sound */
      }
      start(e.pointerId, pitch);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const cur = held.current.get(e.pointerId);
      if (cur === undefined) return;
      const r = e.currentTarget.getBoundingClientRect();
      const y = Math.min(r.height, Math.max(RULER_HEIGHT, e.clientY - r.top));
      const pitch = yToPitch(getViewport(), y - RULER_HEIGHT);
      if (pitch === cur) return;
      end(e.pointerId);
      start(e.pointerId, pitch);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => end(e.pointerId),
    onPointerCancel: (e: PointerEvent<HTMLElement>) => end(e.pointerId),
    onLostPointerCapture: (e: PointerEvent<HTMLElement>) => end(e.pointerId),
  };
}
