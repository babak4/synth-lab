import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { useServices } from '@/app/context';
import { formatBarBeat } from '@/core/transport';
import { isTypingTarget } from './keyboard/keyboard-player';
import './transport.css';

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor" stroke="none">
    {children}
  </svg>
);

/** Space (play/stop) and Home (return to start), unless the focused control uses those keys itself. */
function useTransportShortcuts(toggle: () => unknown, home: () => unknown): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const el = e.target instanceof Element ? e.target : null;
      if (e.code === 'Space' && !el?.closest('button, a[href], select, input, textarea, [role=button], [role=slider], [role=tab], [role=switch], [role=checkbox], [role=radio], summary')) {
        e.preventDefault();
        toggle();
      } else if (e.code === 'Home' && !el?.closest('[role=slider], [role=tab], [role=listbox], [role=spinbutton], select, input, textarea')) {
        e.preventDefault();
        home();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, home]);
}

/** Bar.beat readout; written straight into the DOM ~10 times a second (a beat is far slower), so it never re-renders. */
function PositionReadout() {
  const { transportStore, projectStore } = useServices();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const paint = () => {
      const el = ref.current;
      if (!el) return;
      const text = formatBarBeat(transportStore.getState().getPosition(), projectStore.getState().project.timeSignature);
      if (el.textContent !== text) el.textContent = text;
    };
    paint();
    const timer = setInterval(paint, 100);
    const offStore = transportStore.subscribe(paint);
    return () => {
      clearInterval(timer);
      offStore();
    };
  }, [transportStore, projectStore]);
  // A timer role is not a live region, so screen readers do not announce every beat.
  return <span ref={ref} role="timer" aria-live="off" className="transport-pos" aria-label="Position (bar.beat)" data-testid="transport-position" />;
}

export function TransportControls() {
  const { transportStore, projectStore, appStore, startAudio } = useServices();
  const phase = useStore(transportStore, (s) => s.state);
  const metronome = useStore(transportStore, (s) => s.metronome);
  const countIn = useStore(transportStore, (s) => s.countIn);
  const loop = useStore(projectStore, (s) => s.project.loop.enabled);
  const running = phase !== 'stopped';

  // Play needs the audio clock running; a click or key press is the user gesture that may start it.
  const toggle = useCallback(async () => {
    const t = transportStore.getState();
    if (t.isRunning()) return t.stop();
    if (appStore.getState().audio !== 'on') await startAudio();
    transportStore.getState().play();
  }, [transportStore, appStore, startAudio]);
  const home = useCallback(() => transportStore.getState().returnToStart(), [transportStore]);
  useTransportShortcuts(toggle, home);

  return (
    <div className="transport" role="group" aria-label="Transport" data-help-for="composition" data-state={phase}>
      <button type="button" onClick={home} aria-label="Return to start" title="Return to start (Home)">
        <Icon>
          <path d="M3 3h2v10H3zM13 3v10L6 8z" />
        </Icon>
      </button>
      <button
        type="button"
        className="transport-play"
        onClick={() => void toggle()}
        aria-label={running ? 'Stop' : 'Play'}
        title={running ? 'Stop (Space)' : 'Play (Space)'}
        data-running={running}
      >
        <Icon>{running ? <path d="M3 3h10v10H3z" /> : <path d="M4 2.5v11L13.5 8z" />}</Icon>
      </button>
      <button
        type="button"
        aria-pressed={loop}
        aria-label="Loop"
        title={loop ? 'Loop on' : 'Loop off'}
        onClick={() => transportStore.getState().setLoop(!loop)}
      >
        <Icon>
          <path d="M3 7a4 4 0 0 1 4-4h3V1l4 3.5L10 8V6H7a1 1 0 0 0-1 1v1H3zM13 9a4 4 0 0 1-4 4H6v2L2 11.5 6 8v2h3a1 1 0 0 0 1-1V8h3z" />
        </Icon>
      </button>
      <button
        type="button"
        aria-pressed={metronome}
        aria-label="Metronome"
        title={metronome ? 'Metronome on' : 'Metronome off'}
        onClick={() => transportStore.getState().setMetronome(!metronome)}
      >
        <Icon>
          <path d="M5.5 1h5l3 13h-11zM8 4 9.6 10.5 8.6 10.7 7.4 4.3z" fillRule="evenodd" />
        </Icon>
      </button>
      <button
        type="button"
        className="transport-count"
        aria-pressed={countIn}
        aria-label="Count-in"
        title={countIn ? 'One-bar count-in on' : 'One-bar count-in off'}
        onClick={() => transportStore.getState().setCountIn(!countIn)}
      >
        1 2 3 4
      </button>
      <PositionReadout />
    </div>
  );
}
