/**
 * Piano roll editing state and actions (plan T5.3b). UI state, not project state: the tool, snap and
 * note length, the selection, the clipboard, the keyboard cursor, the drag in progress and the text for
 * the live status region. The project itself is only ever changed through ONE path, `commit`, which
 * runs a note diff through the shared undo stack (history-store.ts) so every edit is undoable.
 *
 * The rules (overlap policy, clamping, snapping, drag maths) live in `core/piano-roll`; this store
 * strings them together and keeps the gesture in progress. A drag never touches the project until the
 * pointer is released: while it lasts, `preview.notes` holds the whole track as it would be, and the
 * canvas draws that. Release commits it as ONE undo step; Escape or a change underneath cancels it.
 *
 * Gestures (pointer): press/drag/release below. Keys: `runAction` (see core/piano-roll/edit-keys.ts).
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { newId, type Note } from '@/core/contracts/project';
import {
  DEFAULT_LENGTH,
  DEFAULT_SNAP,
  DEFAULT_VELOCITY,
  addNote,
  applyDiff,
  applyEdit,
  beatTicks,
  clickDuration,
  countNotes,
  deleteNotes,
  describeLength,
  describeNote,
  describePosition,
  diffNotes,
  drawStart,
  drawnDuration,
  duplicateNotes,
  editLimit,
  gridStep,
  invertDiff,
  lengthTicks,
  makeBox,
  makeClip,
  moveDeltas,
  movedNotes,
  noteEnd,
  notesInBox,
  nudgeNotes,
  pasteClip,
  plural,
  resizeDelta,
  resizedNotes,
  snapFloor,
  snapRound,
  snapTicks,
  stepFor,
  transposeNotes,
  withLength,
  yToPitch,
  type Box,
  type Clip,
  type EditAction,
  type LengthSetting,
  type MoveStart,
  type NoteDiff,
  type ResizeStart,
  type SnapSetting,
} from '@/core/piano-roll';
import { noteName } from '@/core/pitch';
import { updateTrack } from '@/core/project-ops';
import { songEndTick } from '@/core/transport';
import type { Command } from '@/core/history';
import type { Project } from '@/core/contracts/project';
import type { HistoryStore } from './history-store';
import type { PianoRollViewStore } from './piano-roll-view';
import { selectedTrack, type ProjectStore } from './project-store';
import type { TransportStore } from './transport-store';

export type Tool = 'draw' | 'select';

/** Where the pointer is, in music: converted from pixels by the component. */
export interface Pointer {
  tick: number;
  pitch: number;
  /** Fractional pitch row (pitch p covers [p, p+1)); used by the selection box. */
  row: number;
  alt: boolean;
  shift: boolean;
}

export interface Cursor {
  tick: number;
  pitch: number;
}

/** What the canvas should draw instead of the stored notes while a drag is in progress. */
export interface Preview {
  kind: 'move' | 'resize' | 'draw' | 'box';
  trackId: string;
  /** The selected track's notes as they would be if the drag ended now (null for a box). */
  notes: Note[] | null;
  box: Box | null;
}

export interface PianoRollEditState {
  tool: Tool;
  snap: SnapSetting;
  length: LengthSetting;
  /** Ids of the selected notes (all on the selected track). */
  selection: string[];
  clipboard: Clip | null;
  /** Keyboard cursor; null while keyboard entry is off. */
  cursor: Cursor | null;
  preview: Preview | null;
  /** Text for the polite live region; `statusSeq` changes with every message so tests can wait for one. */
  status: string;
  statusSeq: number;
  /** The component plays this pitch briefly when `seq` changes. */
  audition: { pitch: number; seq: number } | null;

  setTool(tool: Tool): void;
  setSnap(snap: SnapSetting): void;
  setLength(change: Partial<LengthSetting>): void;
  setSelection(ids: readonly string[]): void;
  selectAll(): void;
  clearSelection(): void;
  announce(text: string): void;

  /** Pointer gestures. `hit` is the note under the pointer (null for empty grid). */
  press(hit: { id: string; zone: 'body' | 'resize' } | null, p: Pointer): void;
  /** `moved`: the pointer has travelled far enough from the press to count as a drag. */
  drag(p: Pointer, moved: boolean): void;
  release(): void;
  cancelGesture(): boolean;
  isDragging(): boolean;

  /** Keyboard actions (decoded by `interpretEditKey`). Every outcome is announced in `status`. */
  runAction(action: EditAction): void;
}

export type PianoRollEditStore = StoreApi<PianoRollEditState>;

export interface PianoRollEditDeps {
  projectStore: ProjectStore;
  historyStore: HistoryStore;
  transportStore: TransportStore;
  view: PianoRollViewStore;
}

type Gesture =
  | { kind: 'move'; origin: readonly Note[]; start: MoveStart; id: string; collapse: boolean; toggleOff: boolean; moved: boolean; lastPitch: number; key: string }
  | { kind: 'resize'; origin: readonly Note[]; start: ResizeStart; moved: boolean; key: string }
  | { kind: 'draw'; origin: readonly Note[]; id: string; tick: number; pitch: number; moved: boolean; key: string }
  | { kind: 'box'; origin: readonly Note[]; tick: number; row: number; before: string[]; base: string[]; shift: boolean; moved: boolean };

const idsOf = (notes: readonly Note[]): string[] => notes.map((n) => n.id);

/** Apply `fn` to the notes of one track of a project (no change when the track is gone). */
function withTrackNotes(p: Project, trackId: string, fn: (notes: Note[]) => Note[]): Project {
  const t = p.tracks.find((x) => x.id === trackId);
  return t ? updateTrack(p, trackId, { notes: fn(t.notes) }) : p;
}

export function createPianoRollEditStore(deps: PianoRollEditDeps): PianoRollEditStore {
  const { projectStore, historyStore, transportStore, view } = deps;
  let gesture: Gesture | null = null;

  const track = () => selectedTrack(projectStore.getState());
  const project = () => projectStore.getState().project;
  const songTicks = () => songEndTick(project().lengthBars, project().timeSignature);

  return createStore<PianoRollEditState>()((set, get) => {
    const announce = (text: string) => set((s) => ({ status: text, statusSeq: s.statusSeq + 1 }));
    const audition = (pitch: number) => set((s) => ({ audition: { pitch, seq: (s.audition?.seq ?? 0) + 1 } }));
    const sig = () => project().timeSignature;

    /** The one way notes change: a diff run through the undo stack as one step. Returns false when nothing changed. */
    const commit = (label: string, next: readonly Note[], opts: { coalesceKey?: string; select?: readonly string[] } = {}): boolean => {
      const t = track();
      const diff = diffNotes(t.notes, next);
      if (!diff) return false;
      const trackId = t.id;
      const apply = (d: NoteDiff) => (p: Project) => withTrackNotes(p, trackId, (notes) => applyDiff(notes, d));
      const cmd: Command<Project> = {
        label,
        target: trackId,
        coalesceKey: opts.coalesceKey,
        redo: apply(diff),
        undo: apply(invertDiff(diff)),
      };
      historyStore.history.execute(cmd);
      if (opts.select) set({ selection: [...opts.select] });
      return true;
    };

    const selectedNotes = (): Note[] => {
      const ids = new Set(get().selection);
      return track().notes.filter((n) => ids.has(n.id));
    };

    /** A short key naming this selection, so repeated key presses on the same notes merge into one undo step. */
    const selectionKey = (kind: string): string => `${kind}:${[...get().selection].sort().join(',')}`;

    // Keep the selection to notes that exist on the selected track; drop a drag the project moved out from under.
    let lastNotes: readonly Note[] = track().notes;
    let lastTrack = track().id;
    projectStore.subscribe(() => {
      const t = track();
      if (t.notes === lastNotes && t.id === lastTrack) return;
      if (gesture && (t.id !== lastTrack || t.notes !== gesture.origin)) {
        gesture = null;
        set({ preview: null });
      }
      lastNotes = t.notes;
      lastTrack = t.id;
      const sel = get().selection;
      if (sel.length === 0) return;
      const have = new Set(idsOf(t.notes));
      const kept = sel.filter((id) => have.has(id));
      if (kept.length !== sel.length) set({ selection: kept });
    });

    const cursorNoteAt = (c: Cursor): Note | undefined =>
      track().notes.find((n) => n.pitch === c.pitch && n.start <= c.tick && c.tick < noteEnd(n));

    const describeCursor = (c: Cursor): string => {
      const here = cursorNoteAt(c);
      return `${noteName(c.pitch)}, ${describePosition(c.tick, sig())}${here ? ', note here' : ''}`;
    };

    const placeCursor = (c: Cursor) => {
      set({ cursor: c });
      view.getState().reveal(c.tick, c.pitch);
      announce(describeCursor(c));
    };

    const preview = (kind: Preview['kind'], notes: Note[] | null, box: Box | null = null) =>
      set({ preview: { kind, trackId: track().id, notes, box } });

    return {
      tool: 'draw',
      snap: DEFAULT_SNAP,
      length: DEFAULT_LENGTH,
      selection: [],
      clipboard: null,
      cursor: null,
      preview: null,
      status: '',
      statusSeq: 0,
      audition: null,

      setTool: (tool) => set({ tool }),
      setSnap: (snap) => set({ snap }),
      setLength: (change) => set((s) => ({ length: withLength(s.length, change) })),
      setSelection: (ids) => set({ selection: [...new Set(ids)] }),
      selectAll: () => {
        const ids = idsOf(track().notes);
        set({ selection: ids });
        announce(ids.length === 0 ? 'No notes to select' : `Selected all ${countNotes(ids.length)}`);
      },
      clearSelection: () => set({ selection: [] }),
      announce,

      // ---- pointer gestures ------------------------------------------------------------------

      press(hit, p) {
        gesture = null;
        const t = track();
        const origin = t.notes;
        const limitFor = (sel: readonly Note[]) => editLimit(songTicks(), sel);

        if (hit) {
          const note = origin.find((n) => n.id === hit.id);
          if (!note) return;
          const wasSelected = get().selection.includes(hit.id);
          let selection = get().selection;
          if (p.shift) {
            if (!wasSelected) selection = [...selection, hit.id];
          } else if (!wasSelected) selection = [hit.id];
          set({ selection });
          const ids = new Set(selection);
          const originals = origin.filter((n) => ids.has(n.id));
          if (hit.zone === 'resize') {
            gesture = { kind: 'resize', origin, start: { originals, anchor: note, grabTick: p.tick, limit: limitFor(originals) }, moved: false, key: '' };
          } else {
            gesture = {
              kind: 'move',
              origin,
              id: hit.id,
              start: { originals, anchor: note, grabTick: p.tick, grabPitch: p.pitch, limit: limitFor(originals) },
              collapse: !p.shift && wasSelected,
              toggleOff: p.shift && wasSelected,
              moved: false,
              lastPitch: note.pitch,
              key: '',
            };
          }
          return;
        }

        if (get().tool === 'draw' && !p.shift) {
          gesture = { kind: 'draw', origin, id: newId('note'), tick: drawStart(p.tick, stepFor(get().snap, p.alt)), pitch: p.pitch, moved: false, key: '' };
        } else {
          gesture = { kind: 'box', origin, tick: p.tick, row: p.row, before: get().selection, base: p.shift ? get().selection : [], shift: p.shift, moved: false };
        }
      },

      drag(p, moved) {
        const g = gesture;
        if (!g) return;
        g.moved ||= moved;
        if (!g.moved) return;
        const step = stepFor(get().snap, p.alt);

        if (g.kind === 'move') {
          const d = moveDeltas(g.start, p.tick, p.pitch, step);
          const key = `${d.dTick}/${d.dPitch}`;
          if (key === g.key) return;
          g.key = key;
          preview('move', applyEdit(g.origin, { upsert: movedNotes(g.start, d), limit: g.start.limit }));
          const pitch = g.start.anchor.pitch + d.dPitch;
          if (pitch !== g.lastPitch) {
            g.lastPitch = pitch;
            audition(pitch);
          }
        } else if (g.kind === 'resize') {
          const d = resizeDelta(g.start, p.tick, step);
          const key = String(d);
          if (key === g.key) return;
          g.key = key;
          preview('resize', applyEdit(g.origin, { upsert: resizedNotes(g.start, d), limit: g.start.limit }));
        } else if (g.kind === 'draw') {
          const duration = drawnDuration(g.tick, p.tick, step, songTicks());
          const key = String(duration);
          if (key === g.key) return;
          g.key = key;
          if (g.tick >= songTicks()) return;
          const note: Note = { id: g.id, pitch: g.pitch, start: g.tick, duration, velocity: DEFAULT_VELOCITY };
          preview('draw', applyEdit(g.origin, { upsert: [note], limit: songTicks() }));
        } else {
          const box = makeBox(g.tick, g.row, p.tick, p.row);
          const hitIds = idsOf(notesInBox(g.origin, box));
          set({ selection: g.shift ? [...new Set([...g.base, ...hitIds])] : hitIds });
          preview('box', null, box);
        }
      },

      release() {
        const g = gesture;
        gesture = null;
        if (!g) return;
        const pv = get().preview;
        set({ preview: null });
        const s = get();

        if (!g.moved) {
          if (g.kind === 'move') {
            if (g.collapse) set({ selection: [g.id] });
            else if (g.toggleOff) set({ selection: s.selection.filter((id) => id !== g.id) });
          } else if (g.kind === 'draw') {
            const duration = clickDuration(g.tick, lengthTicks(s.length), songTicks());
            if (g.tick >= songTicks() || duration < 1) {
              announce('That is past the end of the song');
              return;
            }
            const note: Note = { id: g.id, pitch: g.pitch, start: g.tick, duration, velocity: DEFAULT_VELOCITY };
            const out = addNote(track().notes, note, songTicks());
            if (out && commit('Add note', out.notes, { select: out.created })) {
              audition(note.pitch);
              announce(`Added ${describeNote(note, sig())}`);
            }
          } else if (g.kind === 'box' && !g.shift) {
            set({ selection: [] });
          }
          return;
        }

        if (g.kind === 'box') {
          const n = get().selection.length;
          announce(n === 0 ? 'No notes in the box' : `Selected ${countNotes(n)}`);
          return;
        }
        if (!pv?.notes) return;
        if (g.kind === 'move') {
          if (commit(`Move ${countNotes(g.start.originals.length)}`, pv.notes)) {
            const moved = track().notes.find((n) => n.id === g.id);
            announce(g.start.originals.length === 1 && moved ? `Moved to ${describeNote(moved, sig())}` : `Moved ${countNotes(g.start.originals.length)}`);
          }
        } else if (g.kind === 'resize') {
          if (commit(`Resize ${countNotes(g.start.originals.length)}`, pv.notes)) {
            const a = track().notes.find((n) => n.id === g.start.anchor.id);
            announce(a ? `Resized to ${describeLength(a.duration)}` : `Resized ${countNotes(g.start.originals.length)}`);
          }
        } else if (g.kind === 'draw') {
          const drawn = pv.notes.find((n) => n.id === g.id);
          if (drawn && commit('Draw note', pv.notes, { select: [g.id] })) {
            audition(drawn.pitch);
            announce(`Added ${describeNote(drawn, sig())}`);
          }
        }
      },

      cancelGesture() {
        if (!gesture) return false;
        const before = gesture.kind === 'box' ? gesture.before : null;
        gesture = null;
        set({ preview: null });
        if (before) set({ selection: before });
        return true;
      },

      isDragging: () => gesture !== null && gesture.moved,

      // ---- keyboard actions ------------------------------------------------------------------

      runAction(action) {
        const s = get();
        const t = track();
        const step = gridStep(s.snap);
        const song = songTicks();

        switch (action.kind) {
          case 'transpose': {
            const res = transposeNotes(t.notes, s.selection, action.semitones, song);
            if (!res) {
              announce(action.semitones > 0 ? 'Already at the highest pitch' : 'Already at the lowest pitch');
              return;
            }
            if (commit(`Transpose ${countNotes(s.selection.length)}`, res.notes, { coalesceKey: selectionKey('transpose') })) {
              const sel = selectedNotes();
              const first = sel[0];
              if (first) audition(first.pitch);
              const dir = res.delta > 0 ? 'up' : 'down';
              announce(sel.length === 1 && first ? describeNote(first, sig()) : `Transposed ${countNotes(sel.length)} ${dir} ${plural(Math.abs(res.delta), 'semitone')}`);
            }
            return;
          }
          case 'nudge': {
            const amount = (action.big ? beatTicks(sig()) : step) * action.direction;
            const res = nudgeNotes(t.notes, s.selection, amount, song);
            if (!res) {
              announce(action.direction > 0 ? 'No room to move later' : 'Already at the start');
              return;
            }
            if (commit(`Nudge ${countNotes(s.selection.length)}`, res.notes, { coalesceKey: selectionKey('nudge') })) {
              const sel = selectedNotes();
              const first = sel[0];
              announce(sel.length === 1 && first ? describeNote(first, sig()) : `Moved ${countNotes(sel.length)} ${res.delta > 0 ? 'later' : 'earlier'}`);
            }
            return;
          }
          case 'cursor': {
            const c = s.cursor;
            if (!c) return;
            const move = action.dSteps * (action.big ? beatTicks(sig()) : step);
            const tick = Math.max(0, Math.min(song - 1, action.dSteps === 0 ? c.tick : snapRound(c.tick + move, snapTicks(s.snap))));
            const pitch = Math.max(0, Math.min(127, c.pitch + action.dPitch));
            placeCursor({ tick, pitch });
            if (pitch !== c.pitch) audition(pitch);
            return;
          }
          case 'enter': {
            const c = s.cursor;
            if (!c) {
              const vp = view.getState().viewport;
              const size = view.getState().size;
              const pitch = yToPitch(vp, size.height / 2);
              const tick = Math.min(song - 1, snapFloor(transportStore.getState().getPosition(), snapTicks(s.snap)));
              set({ cursor: { tick, pitch } });
              view.getState().reveal(tick, pitch);
              announce(`Keyboard entry on. ${describeCursor({ tick, pitch })}. Arrow keys move the cursor, Enter adds a note, Escape finishes.`);
              return;
            }
            const here = cursorNoteAt(c);
            if (here) {
              const on = s.selection.includes(here.id);
              set({ selection: on ? s.selection.filter((id) => id !== here.id) : [...s.selection, here.id] });
              announce(`${on ? 'Deselected' : 'Selected'} ${describeNote(here, sig())}`);
              return;
            }
            const duration = clickDuration(c.tick, lengthTicks(s.length), song);
            const note: Note = { id: newId('note'), pitch: c.pitch, start: c.tick, duration, velocity: DEFAULT_VELOCITY };
            const out = duration >= 1 ? addNote(t.notes, note, song) : null;
            if (!out || !commit('Add note', out.notes)) {
              announce('No room for a note here');
              return;
            }
            audition(note.pitch);
            announce(`Added ${describeNote(note, sig())}`);
            // Step entry: the cursor moves to the end of the note, ready for the next one.
            set({ cursor: { tick: Math.min(song - 1, c.tick + duration), pitch: c.pitch } });
            view.getState().reveal(Math.min(song - 1, c.tick + duration), c.pitch);
            return;
          }
          case 'delete': {
            const under = s.cursor ? cursorNoteAt(s.cursor) : undefined;
            const ids = s.selection.length > 0 ? s.selection : under ? [under.id] : [];
            const next = deleteNotes(t.notes, ids);
            if (!next) {
              announce('Nothing to delete');
              return;
            }
            const n = t.notes.length - next.length;
            if (commit(`Delete ${countNotes(n)}`, next)) announce(`Deleted ${countNotes(n)}`);
            return;
          }
          case 'selectAll':
            get().selectAll();
            return;
          case 'deselect':
            if (s.selection.length > 0) {
              set({ selection: [] });
              announce('Selection cleared');
            } else if (s.cursor) {
              set({ cursor: null });
              announce('Keyboard entry off');
            }
            return;
          case 'duplicate': {
            const out = duplicateNotes(t.notes, s.selection, song, () => newId('note'));
            if (!out) {
              announce(s.selection.length === 0 ? 'Select notes to duplicate' : 'No room to duplicate');
              return;
            }
            if (commit(`Duplicate ${countNotes(s.selection.length)}`, out.notes, { select: out.created })) announce(`Duplicated ${countNotes(out.created.length)}`);
            return;
          }
          case 'copy':
          case 'cut': {
            const clip = makeClip(selectedNotes());
            if (!clip) {
              announce(`Select notes to ${action.kind}`);
              return;
            }
            set({ clipboard: clip });
            if (action.kind === 'copy') {
              announce(`Copied ${countNotes(clip.notes.length)}`);
              return;
            }
            const next = deleteNotes(t.notes, s.selection);
            if (next && commit(`Cut ${countNotes(clip.notes.length)}`, next)) announce(`Cut ${countNotes(clip.notes.length)}`);
            return;
          }
          case 'paste': {
            if (!s.clipboard) {
              announce('Nothing copied yet');
              return;
            }
            const at = Math.round(transportStore.getState().getPosition());
            const out = pasteClip(t.notes, s.clipboard, at, song, () => newId('note'));
            if (!out) {
              announce('No room to paste here');
              return;
            }
            if (commit(`Paste ${countNotes(out.created.length)}`, out.notes, { select: out.created })) {
              announce(`Pasted ${countNotes(out.created.length)} at ${describePosition(at, sig())}`);
            }
            return;
          }
        }
      },
    };
  });
}
