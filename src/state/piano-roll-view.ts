/**
 * Piano roll view state (plan T5.3a): scroll, zoom, the size of the grid and the ghost-note toggle.
 * Not part of the project document and never undoable; it only decides what part of the song is shown.
 * Every rule lives in `core/piano-roll`; this store applies them to the current bounds.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Note } from '@/core/contracts/project';
import {
  clampViewport,
  defaultViewport,
  fitToNotes,
  revealCell,
  sameViewport,
  scrollBy,
  zoomAxis,
  type ViewAction,
  type Viewport,
} from '@/core/piano-roll';
import type { Size } from '@/core/piano-roll';

export interface PianoRollViewState {
  viewport: Viewport;
  /** Grid area in CSS pixels; 0×0 until the component has been laid out. */
  size: Size;
  /** Length of the scrollable timeline in ticks. */
  contentTicks: number;
  /** Show the other tracks' notes faintly. */
  ghostNotes: boolean;
  setSize(size: Size): void;
  setContentTicks(ticks: number): void;
  setGhostNotes(on: boolean): void;
  scrollBy(dxPx: number, dyPx: number): void;
  /** Scale one axis; `anchor` is in grid-area pixels (default: the centre). */
  zoom(axis: 'x' | 'y', factor: number, anchor?: { x: number; y: number }): void;
  fit(notes: readonly Note[]): void;
  /** Scroll the least amount that shows this cell (the keyboard cursor). */
  reveal(tick: number, pitch: number): void;
  /** Apply a decoded wheel or key action. */
  apply(action: ViewAction, notes: readonly Note[], anchor?: { x: number; y: number }): void;
  reset(): void;
}

export type PianoRollViewStore = StoreApi<PianoRollViewState>;

const INITIAL_CONTENT = 8 * 3840;

export function createPianoRollViewStore(): PianoRollViewStore {
  return createStore<PianoRollViewState>()((set, get) => {
    // Until the first real layout there is nothing to centre on; the first non-empty size places the view.
    let placed = false;
    const update = (next: Viewport) => {
      if (!sameViewport(next, get().viewport)) set({ viewport: next });
    };
    return {
      viewport: { scrollTick: 0, scrollY: 0, pxPerTick: 0.1, rowHeight: 16 },
      size: { width: 0, height: 0 },
      contentTicks: INITIAL_CONTENT,
      ghostNotes: true,
      setSize: (size) => {
        const cur = get().size;
        if (cur.width === size.width && cur.height === size.height) return;
        const s = get();
        if (!placed && size.width > 0 && size.height > 0) {
          placed = true;
          set({ size, viewport: defaultViewport(size, s.contentTicks) });
        } else {
          set({ size, viewport: clampViewport(s.viewport, size, s.contentTicks) });
        }
      },
      setContentTicks: (contentTicks) => {
        if (contentTicks === get().contentTicks) return;
        const s = get();
        set({ contentTicks, viewport: clampViewport(s.viewport, s.size, contentTicks) });
      },
      setGhostNotes: (ghostNotes) => set({ ghostNotes }),
      scrollBy: (dx, dy) => {
        const s = get();
        update(scrollBy(s.viewport, dx, dy, s.size, s.contentTicks));
      },
      zoom: (axis, factor, anchor) => {
        const s = get();
        update(zoomAxis(s.viewport, axis, factor, s.size, s.contentTicks, anchor));
      },
      fit: (notes) => {
        const s = get();
        update(fitToNotes(notes, s.size, s.contentTicks));
      },
      reveal: (tick, pitch) => {
        const s = get();
        update(revealCell(s.viewport, tick, pitch, s.size, s.contentTicks));
      },
      apply: (action, notes, anchor) => {
        const s = get();
        if (action.kind === 'scroll') s.scrollBy(action.dx, action.dy);
        else if (action.kind === 'zoom') s.zoom(action.axis, action.factor, anchor);
        else s.fit(notes);
      },
      reset: () => {
        const s = get();
        update(defaultViewport(s.size, s.contentTicks));
      },
    };
  });
}

/** The one view of the app: it survives switching tabs, which unmounts the piano roll. */
export const pianoRollView: PianoRollViewStore = createPianoRollViewStore();
