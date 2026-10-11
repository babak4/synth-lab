import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useStore } from 'zustand';
import { useServices } from '@/app/context';
import {
  contentTicksFor,
  dragged,
  hitTest,
  indexFor,
  interpretEditKey,
  interpretKey,
  interpretWheel,
  lengthTicks,
  rowAt,
  xToTick,
  yToPitch,
  ZOOM_STEP,
} from '@/core/piano-roll';
import type { Pointer } from '@/state/piano-roll-edit';
import { selectedTrack } from '@/state/project-store';
import { pianoRollView } from '@/state/piano-roll-view';
import { useCanvas } from '@/ui/visualisers/useCanvas';
import { drawPianoRoll, gridSize, KEY_WIDTH, RULER_HEIGHT, type FrameStats, type Scene } from './draw';
import { EditToolbar } from './EditToolbar';
import { StatusRegion } from './StatusRegion';
import { useAudition, usePitchPreview } from './useAudition';
import './piano-roll.css';

export interface PianoRollProps {
  /** Transport position in ticks; omit to follow the transport store. */
  playheadTick?: number;
}

const HELP_TEXT =
  'Editing: click an empty cell to add a note of the current length, drag to draw a longer one, drag a note to move it, ' +
  'drag its right edge to resize, hold Alt to bypass snap, Shift click or drag a box to select. ' +
  'With notes selected: up and down arrows transpose, Shift for an octave, left and right arrows nudge by the snap step, ' +
  'Delete removes, Control or Command with D duplicates, C, X and V copy, cut and paste at the playhead, A selects all, Escape deselects. ' +
  'Keyboard entry: press Enter to place a cursor, arrow keys move it, Enter adds a note or selects the note under it, Escape finishes. ' +
  'With nothing selected and no cursor, arrow keys scroll, Page Up and Page Down scroll a page of pitches, plus and minus zoom time, ' +
  'left and right square brackets zoom pitch, F fits the view to the notes. Control and mouse wheel zooms time, ' +
  'Alt and mouse wheel zooms pitch, Shift and mouse wheel scrolls sideways.';

/** Piano roll for the selected track: pitch up the side, bars and beats along the top. Editing goes through the edit store. */
export function PianoRoll({ playheadTick }: PianoRollProps) {
  const { projectStore, pianoRollEdit, transportStore } = useServices();
  const project = useStore(projectStore, (s) => s.project);
  const track = useStore(projectStore, selectedTrack);
  const ghost = useStore(pianoRollView, (s) => s.ghostNotes);
  const auditionRequest = useStore(pianoRollEdit, (s) => s.audition);
  const helpId = useId();
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<{ stats: FrameStats | null; draws: number }>({ stats: null, draws: 0 });
  const lastKey = useRef<unknown[]>([]);
  const selectionSet = useRef<{ ids: readonly string[]; set: ReadonlySet<string> }>({ ids: [], set: new Set() });
  const press = useRef<{ pointerId: number; x: number; y: number; moved: boolean; last: { x: number; y: number; alt: boolean; shift: boolean } } | null>(null);
  /** Set on every render below: re-run the drag from the last pointer position (the view scrolled under it). */
  const refreshDrag = useRef<() => void>(() => {});

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
    if (typeof ResizeObserver === 'undefined') return; // jsdom
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
      refreshDrag.current(); // a drag in progress is now over a different tick and pitch
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [projectStore]);

  // Audition requests from the edit store (a note was placed, or its pitch changed). Requests that were
  // already pending when this component mounted (the roll was off screen) are not replayed.
  const preview = usePitchPreview();
  const seen = useRef(pianoRollEdit.getState().audition?.seq ?? 0);
  useEffect(() => {
    if (auditionRequest && auditionRequest.seq !== seen.current) {
      seen.current = auditionRequest.seq;
      preview(auditionRequest.pitch);
    }
  }, [auditionRequest, preview]);

  // ---- pointer → music ---------------------------------------------------------------------

  /** Grid-area pixel position of a pointer event, or null when it is outside the stage. */
  const gridPoint = (e: PointerEvent<HTMLElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left - KEY_WIDTH, y: e.clientY - r.top - RULER_HEIGHT };
  };
  const toPointer = (pt: { x: number; y: number }, mods: { alt: boolean; shift: boolean }): Pointer => {
    const vp = pianoRollView.getState().viewport;
    return { tick: xToTick(vp, pt.x), pitch: yToPitch(vp, pt.y), row: rowAt(pt.y, vp.scrollY, vp.rowHeight), ...mods };
  };
  const eventPoint = (e: PointerEvent<HTMLElement>) => ({ x: e.clientX, y: e.clientY, alt: e.altKey, shift: e.shiftKey });

  useEffect(() => {
    refreshDrag.current = () => {
      const pr = press.current;
      const el = stage.current;
      if (!pr || !el) return;
      const r = el.getBoundingClientRect();
      const { x, y, ...mods } = pr.last;
      pianoRollEdit.getState().drag(toPointer({ x: x - r.left - KEY_WIDTH, y: y - r.top - RULER_HEIGHT }, mods), pr.moved);
    };
  });

  const audition = useAudition(() => pianoRollView.getState().viewport);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    audition.onPointerDown(e); // the piano column
    if (e.button !== 0) return; // not the right or middle button, and not a pen's barrel or eraser (button 5)
    const pt = gridPoint(e);
    if (pt.x < 0 || pt.y < 0) return;
    const view = pianoRollView.getState();
    if (pt.x >= view.size.width || pt.y >= view.size.height) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthesised pointers cannot always be captured; the gesture still works while the pointer stays over the grid */
    }
    press.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false, last: eventPoint(e) };
    const hit = hitTest(indexFor(selectedTrack(projectStore.getState()).notes), view.viewport, pt.x, pt.y);
    pianoRollEdit.getState().press(hit ? { id: hit.note.id, zone: hit.zone } : null, toPointer(pt, { alt: e.altKey, shift: e.shiftKey }));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    audition.onPointerMove(e);
    const pr = press.current;
    if (pr && pr.pointerId === e.pointerId) {
      // No button down any more: the release was lost (outside the window, a dismissed dialog …). End the gesture.
      if (e.buttons === 0) {
        endPress(e, false);
        return;
      }
      pr.moved ||= dragged(e.clientX - pr.x, e.clientY - pr.y);
      pr.last = eventPoint(e);
      pianoRollEdit.getState().drag(toPointer(gridPoint(e), { alt: e.altKey, shift: e.shiftKey }), pr.moved);
      return;
    }
    // Hovering: show what a press would do.
    const pt = gridPoint(e);
    const view = pianoRollView.getState();
    let cursor = '';
    if (pt.x >= 0 && pt.y >= 0 && pt.x < view.size.width && pt.y < view.size.height) {
      const hit = hitTest(indexFor(selectedTrack(projectStore.getState()).notes), view.viewport, pt.x, pt.y);
      cursor = hit ? (hit.zone === 'resize' ? 'ew-resize' : 'grab') : pianoRollEdit.getState().tool === 'draw' ? 'crosshair' : 'default';
    }
    if (e.currentTarget.style.cursor !== cursor) e.currentTarget.style.cursor = cursor;
  };

  const endPress = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const pr = press.current;
    if (!pr || pr.pointerId !== e.pointerId) return;
    press.current = null;
    const edit = pianoRollEdit.getState();
    if (commit) {
      pr.moved ||= dragged(e.clientX - pr.x, e.clientY - pr.y);
      edit.drag(toPointer(gridPoint(e), { alt: e.altKey, shift: e.shiftKey }), pr.moved);
      edit.release();
    } else {
      edit.cancelGesture();
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    audition.onPointerUp(e);
    endPress(e, true);
  };
  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    audition.onPointerCancel(e);
    endPress(e, false);
  };

  // ---- keyboard ----------------------------------------------------------------------------

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const edit = pianoRollEdit.getState();
    if (e.key === 'Escape' && press.current && edit.cancelGesture()) {
      press.current = null;
      e.preventDefault();
      return;
    }
    const action = interpretEditKey(e, { hasSelection: edit.selection.length > 0, cursorActive: edit.cursor !== null });
    if (action) {
      e.preventDefault(); // also keeps Ctrl+D from bookmarking the page and the laptop-keyboard player from seeing the key
      edit.runAction(action);
      return;
    }
    const view = pianoRollView.getState();
    const viewAction = interpretKey(e, view.size);
    if (!viewAction) return;
    e.preventDefault(); // also keeps the laptop-keyboard player from treating F, + … as notes
    view.apply(viewAction, selectedTrack(projectStore.getState()).notes);
  };

  // ---- drawing -----------------------------------------------------------------------------

  const ref = useCanvas((args) => {
    const view = pianoRollView.getState();
    const { project: p } = projectStore.getState();
    const t = selectedTrack(projectStore.getState());
    const edit = pianoRollEdit.getState();
    const playhead = playheadTick ?? transportStore.getState().getPosition();
    const shown = edit.preview && edit.preview.trackId === t.id ? edit.preview : null;
    // Nothing moved since the last frame → leave the pixels alone.
    const key = [
      view.viewport, view.size, view.contentTicks, view.ghostNotes, p, t, playhead, args.width, args.height, args.colours, window.devicePixelRatio,
      edit.selection, shown, edit.cursor, edit.length,
    ];
    if (key.length === lastKey.current.length && key.every((v, i) => v === lastKey.current[i])) return;
    lastKey.current = key;
    if (selectionSet.current.ids !== edit.selection) selectionSet.current = { ids: edit.selection, set: new Set(edit.selection) };
    const scene: Scene = {
      project: p,
      track: t,
      others: p.tracks.filter((o) => o.id !== t.id),
      ghost: view.ghostNotes,
      viewport: view.viewport,
      contentTicks: view.contentTicks,
      playheadTick: playhead,
      notes: shown?.notes ?? undefined,
      selection: selectionSet.current.set,
      box: shown?.box ?? null,
      cursor: edit.cursor ? { ...edit.cursor, length: lengthTicks(edit.length) } : null,
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
      <EditToolbar />
      <div
        ref={stage}
        className="pr-stage"
        tabIndex={0}
        role="group"
        aria-label={`Piano roll grid for ${track.name}, ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`}
        aria-describedby={helpId}
        data-arrow-owner
        data-no-shift-sustain
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={(e) => {
          audition.onLostPointerCapture(e);
          if (press.current?.pointerId === e.pointerId) endPress(e, false);
        }}
      >
        <canvas ref={ref} className="pr-canvas" data-viz="piano-roll" aria-hidden="true" />
      </div>
      <p id={helpId} className="visually-hidden">
        {HELP_TEXT}
      </p>
      <StatusRegion />
    </section>
  );
}
