import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { useServices } from '@/app/context';
import { contentTicksFor, indexFor, interpretKey, interpretWheel, ZOOM_STEP } from '@/core/piano-roll';
import { selectedTrack } from '@/state/project-store';
import { pianoRollView } from '@/state/piano-roll-view';
import { useCanvas } from '@/ui/visualisers/useCanvas';
import { drawPianoRoll, gridSize, KEY_WIDTH, RULER_HEIGHT, type FrameStats, type Scene } from './draw';
import { useAudition } from './useAudition';
import './piano-roll.css';

export interface PianoRollProps {
  /** Transport position in ticks; omit to hide the playhead. T5.2 supplies this. */
  playheadTick?: number;
}

const HELP_TEXT =
  'Arrow keys scroll, Page Up and Page Down scroll a page of pitches, plus and minus zoom time, ' +
  'left and right square brackets zoom pitch, F fits the view to the notes. Control and mouse wheel zooms time, ' +
  'Alt and mouse wheel zooms pitch, Shift and mouse wheel scrolls sideways.';

/** Piano roll for the selected track: pitch up the side, bars and beats along the top. Rendering and view only. */
export function PianoRoll({ playheadTick }: PianoRollProps) {
  const { projectStore } = useServices();
  const project = useStore(projectStore, (s) => s.project);
  const track = useStore(projectStore, selectedTrack);
  const ghost = useStore(pianoRollView, (s) => s.ghostNotes);
  const helpId = useId();
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<{ stats: FrameStats | null; draws: number }>({ stats: null, draws: 0 });
  const lastKey = useRef<unknown[]>([]);

  // Bounds: the timeline is as long as the song, or the farthest note of the selected track.
  const farthest = indexFor(track.notes).farthestEnd;
  const contentTicks = contentTicksFor(project.lengthBars, project.timeSignature, farthest);
  useLayoutEffect(() => pianoRollView.getState().setContentTicks(contentTicks), [contentTicks]);

  // Grid size from the stage's layout.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => pianoRollView.getState().setSize(gridSize(el.clientWidth, el.clientHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Test hook: e2e tests assert on view state and on what the last frame drew, not on pixels.
  useEffect(() => {
    const w = window as unknown as { __synth?: Record<string, unknown> };
    if (!w.__synth) return;
    w.__synth.pianoRoll = { view: pianoRollView, frame: () => ({ ...frame.current.stats, draws: frame.current.draws }) };
    return () => {
      if (w.__synth) delete w.__synth.pianoRoll;
    };
  }, []);

  // Wheel needs a non-passive listener so Ctrl+wheel / pinch can be kept from zooming the whole page.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const view = pianoRollView.getState();
      const action = interpretWheel(e, view.size);
      if (!action) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const anchor = { x: Math.max(0, e.clientX - r.left - KEY_WIDTH), y: Math.max(0, e.clientY - r.top - RULER_HEIGHT) };
      view.apply(action, selectedTrack(projectStore.getState()).notes, anchor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [projectStore]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const view = pianoRollView.getState();
    const action = interpretKey(e, view.size);
    if (!action) return;
    e.preventDefault(); // also keeps the laptop-keyboard player from treating F, + … as notes
    view.apply(action, selectedTrack(projectStore.getState()).notes);
  };

  const audition = useAudition(() => pianoRollView.getState().viewport);

  const ref = useCanvas((args) => {
    const view = pianoRollView.getState();
    const { project: p } = projectStore.getState();
    const t = selectedTrack(projectStore.getState());
    // Nothing moved since the last frame → leave the pixels alone.
    const key = [view.viewport, view.size, view.contentTicks, view.ghostNotes, p, t, playheadTick, args.width, args.height, args.colours, window.devicePixelRatio];
    if (key.length === lastKey.current.length && key.every((v, i) => v === lastKey.current[i])) return;
    lastKey.current = key;
    const scene: Scene = {
      project: p,
      track: t,
      others: p.tracks.filter((o) => o.id !== t.id),
      ghost: view.ghostNotes,
      viewport: view.viewport,
      contentTicks: view.contentTicks,
      playheadTick,
    };
    frame.current.stats = drawPianoRoll(args, scene);
    frame.current.draws++;
  });

  const view = pianoRollView.getState;
  const noteCount = track.notes.length;

  return (
    <section className="piano-roll" aria-label="Piano roll">
      <div className="pr-toolbar" role="toolbar" aria-label="Piano roll view">
        <span className="pr-title">
          <span className="pr-swatch" style={{ background: track.colour }} aria-hidden="true" />
          {track.name}
        </span>
        <span className="pr-group" role="group" aria-label="Time zoom">
          <button type="button" aria-label="Zoom time out" title="Zoom time out (-)" onClick={() => view().zoom('x', 1 / ZOOM_STEP)}>
            Time −
          </button>
          <button type="button" aria-label="Zoom time in" title="Zoom time in (+)" onClick={() => view().zoom('x', ZOOM_STEP)}>
            Time +
          </button>
        </span>
        <span className="pr-group" role="group" aria-label="Pitch zoom">
          <button type="button" aria-label="Zoom pitch out" title="Zoom pitch out ([)" onClick={() => view().zoom('y', 1 / ZOOM_STEP)}>
            Pitch −
          </button>
          <button type="button" aria-label="Zoom pitch in" title="Zoom pitch in (])" onClick={() => view().zoom('y', ZOOM_STEP)}>
            Pitch +
          </button>
        </span>
        <button type="button" title="Fit the view to the notes (F)" onClick={() => view().fit(track.notes)}>
          Fit to notes
        </button>
        <button type="button" aria-pressed={ghost} title="Show the other tracks' notes faintly" onClick={() => view().setGhostNotes(!ghost)}>
          Ghost notes
        </button>
      </div>
      <div
        ref={stage}
        className="pr-stage"
        tabIndex={0}
        role="group"
        aria-label={`Piano roll grid for ${track.name}, ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`}
        aria-describedby={helpId}
        data-arrow-owner
        onKeyDown={onKeyDown}
        {...audition}
      >
        <canvas ref={ref} className="pr-canvas" data-viz="piano-roll" aria-hidden="true" />
      </div>
      <p id={helpId} className="visually-hidden">
        {HELP_TEXT}
      </p>
    </section>
  );
}
