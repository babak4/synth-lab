import { useEffect, useMemo, useRef, type PointerEvent } from 'react';
import { useApp, useNotes, useServices } from '@/app/context';
import { FULL_RANGE, layoutKeys, pitchAt } from '@/core/keyboard-layout';
import { BASE_PITCH, labelsForOctave } from '@/core/keyboard';
import { noteName } from '@/core/pitch';
import { useLayoutLabels } from './useLayoutLabels';

const LAYOUT = layoutKeys(FULL_RANGE.lo, FULL_RANGE.hi);

/**
 * 61 keys visible, scrollable to all 88. Mirrors laptop-keyboard input (keys light up), labels the keys
 * the laptop can reach at the current octave, and plays with mouse or touch, including drags across keys.
 */
export function ScreenKeyboard() {
  const { bus, host, appStore, startAudio } = useServices();
  const held = useNotes((s) => s.held);
  const octave = useApp((s) => s.kbdOctave);
  const audio = useApp((s) => s.audio);
  const label = useLayoutLabels();
  const labels = useMemo(() => labelsForOctave(octave, label), [octave, label]);

  const scroller = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  /** pointerId → pitch it is currently holding */
  const pointers = useRef(new Map<number, number>());

  // Keep the keys the laptop can reach in view as the octave changes. The first placement is instant;
  // later octave changes glide (unless the user prefers reduced motion).
  const placed = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo?.({ left: Math.max(0, LAYOUT.xOf(BASE_PITCH + 12 * octave) - 24), behavior: reduced || !placed.current ? 'auto' : 'smooth' });
    placed.current = true;
  }, [octave]);

  const point = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return pitchAt(LAYOUT, ((e.clientX - r.left) * LAYOUT.width) / r.width, ((e.clientY - r.top) * LAYOUT.height) / r.height);
  };
  const start = (pointerId: number, pitch: number) => {
    pointers.current.set(pointerId, pitch);
    if (audio === 'off') void startAudio(); // a click is a user gesture
    bus.emit('note:on', { pitch, velocity: appStore.getState().kbdVelocity, source: 'onscreen', audioTime: host.currentTime });
  };
  const end = (pointerId: number) => {
    const pitch = pointers.current.get(pointerId);
    if (pitch === undefined) return;
    pointers.current.delete(pointerId);
    bus.emit('note:off', { pitch, source: 'onscreen', audioTime: host.currentTime });
  };

  // Release anything still held if the keyboard unmounts mid-gesture.
  useEffect(() => {
    const map = pointers.current;
    return () => [...map.keys()].forEach(end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const pitch = point(e);
    if (pitch === null) return;
    // Capture keeps the drag tracked when the pointer leaves the keys, but it can throw (e.g. WebKit with
    // synthesised pointers). It must never stop the note from sounding.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* best effort */
    }
    start(e.pointerId, pitch);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const cur = pointers.current.get(e.pointerId);
    if (cur === undefined) return;
    const pitch = point(e);
    if (pitch === cur) return;
    end(e.pointerId); // glissando: let go of the key we left…
    if (pitch !== null) start(e.pointerId, pitch); // …and play the one we entered
  };
  const up = (e: PointerEvent<SVGSVGElement>) => end(e.pointerId);

  const scrollBy = (dx: number) => scroller.current?.scrollBy?.({ left: dx, behavior: 'smooth' });

  return (
    <div className="screen-keyboard">
      <button type="button" className="kb-scroll" aria-label="Scroll keyboard left" onClick={() => scrollBy(-240)}>
        ◀
      </button>
      <div className="kb-scroller" ref={scroller} tabIndex={0} role="region" aria-label="Keyboard scroll area" data-arrow-owner>
        <svg
          ref={svg}
          width={LAYOUT.width}
          height={LAYOUT.height}
          viewBox={`0 0 ${LAYOUT.width} ${LAYOUT.height}`}
          role="group"
          aria-label="On-screen piano keyboard. Click or touch keys to play, or use the computer keyboard."
          data-testid="screen-keyboard"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onLostPointerCapture={up}
        >
          {LAYOUT.keys
            .filter((k) => !k.black)
            .map((k) => (
              <g key={k.pitch}>
                <rect className={`key white${held.has(k.pitch) ? ' down' : ''}`} data-pitch={k.pitch} data-down={held.has(k.pitch)} x={k.x} y={k.y} width={k.w} height={k.h}>
                  <title>{noteName(k.pitch)}</title>
                </rect>
                {labels.has(k.pitch) && (
                  <text className="key-label" x={k.x + k.w / 2} y={k.h - 6} textAnchor="middle">
                    {labels.get(k.pitch)}
                  </text>
                )}
                {k.pitch % 12 === 0 && (
                  <text className="key-note" x={k.x + k.w / 2} y={k.h - 22} textAnchor="middle">
                    {noteName(k.pitch)}
                  </text>
                )}
              </g>
            ))}
          {LAYOUT.keys
            .filter((k) => k.black)
            .map((k) => (
              <g key={k.pitch}>
                <rect className={`key black${held.has(k.pitch) ? ' down' : ''}`} data-pitch={k.pitch} data-down={held.has(k.pitch)} x={k.x} y={k.y} width={k.w} height={k.h} rx={2}>
                  <title>{noteName(k.pitch)}</title>
                </rect>
                {labels.has(k.pitch) && (
                  <text className="key-label on-black" x={k.x + k.w / 2} y={k.h - 6} textAnchor="middle">
                    {labels.get(k.pitch)}
                  </text>
                )}
              </g>
            ))}
        </svg>
      </div>
      <button type="button" className="kb-scroll" aria-label="Scroll keyboard right" onClick={() => scrollBy(240)}>
        ▶
      </button>
    </div>
  );
}
