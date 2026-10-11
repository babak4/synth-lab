import { beforeEach, describe, expect, it } from 'vitest';
import { createMockServices } from '@/app/mock-services';
import type { Note, Project } from '@/core/contracts/project';
import { interpretEditKey } from '@/core/piano-roll';
import { pianoRollView } from './piano-roll-view';
import { selectedTrack } from './project-store';
import type { Pointer } from './piano-roll-edit';

const SONG = 8 * 3840;
const n = (id: string, pitch: number, start: number, duration = 480, velocity = 100): Note => ({ id, pitch, start, duration, velocity });
const at = (tick: number, pitch: number, mods: Partial<Pick<Pointer, 'alt' | 'shift'>> = {}): Pointer => ({ tick, pitch, row: pitch + 0.5, alt: false, shift: false, ...mods });

function setup(notes: Note[] = []) {
  const s = createMockServices();
  if (notes.length) {
    const p = structuredClone(s.projectStore.getState().project);
    p.tracks[0]!.notes = notes;
    s.projectStore.getState().loadProject(p);
  }
  const edit = () => s.pianoRollEdit.getState();
  const notesNow = () => selectedTrack(s.projectStore.getState()).notes;
  const byId = (id: string) => notesNow().find((q) => q.id === id)!;
  const undoDepth = () => s.historyStore.history.snapshot().undoDepth;
  const undo = () => s.historyStore.getState().undo();
  const redo = () => s.historyStore.getState().redo();
  /** Click (press + release with no drag) at a point. */
  const click = (p: Pointer, hit: { id: string; zone: 'body' | 'resize' } | null = null) => {
    edit().press(hit, p);
    edit().release();
  };
  /** Press, drag to `to` (as a real drag), release. */
  const dragTo = (from: Pointer, to: Pointer, hit: { id: string; zone: 'body' | 'resize' } | null) => {
    edit().press(hit, from);
    edit().drag(to, true);
    edit().release();
  };
  return { s, edit, notesNow, byId, undoDepth, undo, redo, click, dragTo };
}

beforeEach(() => {
  pianoRollView.getState().setSize({ width: 800, height: 400 });
  pianoRollView.getState().reset();
});

describe('add by click', () => {
  it('places a note of the current length in the clicked cell, selects it, auditions it, one undo step', () => {
    const t = setup();
    t.click(at(1000, 62)); // default snap 1/16 (240): the cell [960, 1200)
    expect(t.notesNow()).toHaveLength(1);
    expect(t.notesNow()[0]).toMatchObject({ pitch: 62, start: 960, duration: 960, velocity: 100 });
    expect(t.edit().selection).toEqual([t.notesNow()[0]!.id]);
    expect(t.edit().audition).toMatchObject({ pitch: 62 });
    expect(t.edit().status).toBe('Added D4 quarter note at bar 1, beat 2');
    expect(t.undoDepth()).toBe(1);
    t.undo();
    expect(t.notesNow()).toHaveLength(0);
    expect(t.edit().selection).toEqual([]); // the selection follows the notes
    t.redo();
    expect(t.notesNow()).toHaveLength(1);
  });

  it('uses the length presets, including dotted and triplet', () => {
    const t = setup();
    t.edit().setLength({ division: 8 });
    t.click(at(0, 60));
    t.edit().setLength({ dotted: true });
    t.click(at(1920, 60));
    t.edit().setLength({ triplet: true, division: 16 });
    t.click(at(3840, 60));
    expect(t.notesNow().map((q) => q.duration)).toEqual([480, 720, 160]);
  });

  it('snap off (free placement) uses the exact tick; Alt bypasses a snap that is on', () => {
    const t = setup();
    t.edit().setSnap({ division: null, triplet: false });
    t.click(at(1003.4, 60));
    t.click(at(2000.6, 62));
    expect(t.notesNow().map((q) => q.start)).toEqual([1003, 2001]);
    t.edit().setSnap({ division: 4, triplet: false });
    t.click(at(5000, 64, { alt: true }));
    t.click(at(5000, 66));
    expect(t.notesNow().filter((q) => q.pitch >= 64).map((q) => q.start)).toEqual([4800, 5000]);
  });

  it('every snap value puts the start on its own grid', () => {
    for (const [division, triplet, step] of [[1, false, 3840], [8, false, 480], [32, false, 120], [4, true, 640], [16, true, 160]] as const) {
      const t = setup();
      t.edit().setSnap({ division, triplet });
      t.click(at(step * 2 + step * 0.9, 60));
      expect(t.notesNow()[0]!.start).toBe(step * 2);
    }
  });

  it('is cut at the end of the song and refused past it', () => {
    const t = setup();
    t.click(at(SONG - 240, 60));
    expect(t.notesNow()[0]!.duration).toBe(240);
    t.click(at(SONG + 100, 61));
    expect(t.notesNow()).toHaveLength(1);
    expect(t.edit().status).toBe('That is past the end of the song');
    expect(t.undoDepth()).toBe(1);
  });

  it('on top of a same-pitch note it trims that note (overlap policy)', () => {
    const t = setup([n('a', 60, 0, 1920)]);
    t.click(at(480, 60));
    expect(t.byId('a')).toMatchObject({ start: 0, duration: 480 });
    expect(t.notesNow()).toHaveLength(2);
    t.undo();
    expect(t.byId('a')).toMatchObject({ start: 0, duration: 1920 }); // one undo restores the trimmed note too
  });
});

describe('draw a length', () => {
  it('press, drag, release: the length follows the pointer on the grid, as one undo step', () => {
    const t = setup();
    t.edit().press(null, at(500, 60));
    t.edit().drag(at(1900, 60), true);
    expect(t.notesNow()).toHaveLength(0); // nothing committed while dragging…
    expect(t.edit().preview?.notes?.[0]).toMatchObject({ start: 480, duration: 1440 }); // …but the canvas has a preview
    t.edit().drag(at(1500, 60), true);
    t.edit().release();
    expect(t.notesNow()[0]).toMatchObject({ pitch: 60, start: 480, duration: 960 });
    expect(t.edit().preview).toBeNull();
    expect(t.undoDepth()).toBe(1);
    expect(t.edit().selection).toEqual([t.notesNow()[0]!.id]);
  });

  it('is never shorter than a step, even dragged backwards, and snap off allows one tick', () => {
    const t = setup();
    t.dragTo(at(1000, 60), at(100, 60), null);
    expect(t.notesNow()[0]!.duration).toBe(240);
    const u = setup();
    u.edit().setSnap({ division: null, triplet: false });
    u.dragTo(at(1000, 60), at(1000.2, 60), null);
    expect(u.notesNow()[0]!.duration).toBe(1);
  });

  it('Escape-style cancel leaves the project untouched', () => {
    const t = setup();
    t.edit().press(null, at(500, 60));
    t.edit().drag(at(1900, 60), true);
    expect(t.edit().cancelGesture()).toBe(true);
    t.edit().release();
    expect(t.notesNow()).toHaveLength(0);
    expect(t.edit().preview).toBeNull();
    expect(t.undoDepth()).toBe(0);
  });
});

describe('move', () => {
  it('drags a note in time and pitch, snapped, as one undo step', () => {
    const t = setup([n('a', 60, 960)]);
    t.dragTo(at(1000, 60), at(1500, 64), { id: 'a', zone: 'body' });
    expect(t.byId('a')).toMatchObject({ pitch: 64, start: 1440 });
    expect(t.undoDepth()).toBe(1);
    expect(t.s.historyStore.getState().undoLabel).toBe('Move 1 note');
    t.undo();
    expect(t.byId('a')).toMatchObject({ pitch: 60, start: 960 });
    t.redo();
    expect(t.byId('a')).toMatchObject({ pitch: 64, start: 1440 });
  });

  it('Alt bypasses snap for the drag', () => {
    const t = setup([n('a', 60, 960)]);
    t.edit().press({ id: 'a', zone: 'body' }, at(1000, 60));
    t.edit().drag(at(1337, 60, { alt: true }), true);
    t.edit().release();
    expect(t.byId('a').start).toBe(1297);
  });

  it('a drag of one of several selected notes moves them all together', () => {
    const t = setup([n('a', 60, 0), n('b', 64, 480), n('c', 67, 1920)]);
    t.edit().setSelection(['a', 'b']);
    t.dragTo(at(10, 60), at(250, 62), { id: 'a', zone: 'body' });
    expect(t.notesNow().map((q) => [q.id, q.pitch, q.start])).toEqual([['a', 62, 240], ['b', 66, 720], ['c', 67, 1920]]);
    expect(t.undoDepth()).toBe(1);
  });

  it('stays inside the song and the keyboard', () => {
    const t = setup([n('a', 126, 0, 480)]);
    t.dragTo(at(10, 126), at(-9000, 200), { id: 'a', zone: 'body' });
    expect(t.byId('a')).toMatchObject({ pitch: 127, start: 0 });
    t.dragTo(at(10, 127), at(SONG * 2, 127), { id: 'a', zone: 'body' });
    expect(t.byId('a').start + t.byId('a').duration).toBeLessThanOrEqual(SONG);
  });

  it('auditions each new pitch while dragging', () => {
    const t = setup([n('a', 60, 0)]);
    t.edit().press({ id: 'a', zone: 'body' }, at(10, 60));
    t.edit().drag(at(10, 62), true);
    const first = t.edit().audition!.seq;
    expect(t.edit().audition!.pitch).toBe(62);
    t.edit().drag(at(500, 62), true); // time only: no new audition
    expect(t.edit().audition!.seq).toBe(first);
    t.edit().drag(at(500, 63), true);
    expect(t.edit().audition!.pitch).toBe(63);
    t.edit().release();
  });

  it('dropping onto a same-pitch note trims it; one undo restores both', () => {
    const t = setup([n('a', 60, 0, 480), n('b', 60, 960, 960)]);
    t.dragTo(at(10, 60), at(1210, 60), { id: 'a', zone: 'body' }); // a lands at 1200
    expect(t.byId('b')).toMatchObject({ start: 960, duration: 240 });
    expect(t.byId('a').start).toBe(1200);
    t.undo();
    expect(t.byId('a').start).toBe(0);
    expect(t.byId('b')).toMatchObject({ start: 960, duration: 960 });
  });

  it('a click without moving does not edit; it selects', () => {
    const t = setup([n('a', 60, 0), n('b', 64, 960)]);
    t.click(at(10, 60), { id: 'a', zone: 'body' });
    expect(t.edit().selection).toEqual(['a']);
    expect(t.undoDepth()).toBe(0);
  });

  it('a drag that ends where it began commits nothing', () => {
    const t = setup([n('a', 60, 960)]);
    t.dragTo(at(1000, 60), at(1010, 60), { id: 'a', zone: 'body' });
    expect(t.undoDepth()).toBe(0);
  });
});

describe('resize', () => {
  it('drags the end to the grid; one undo step; never zero length', () => {
    const t = setup([n('a', 60, 960, 480)]);
    t.dragTo(at(1438, 60), at(2000, 60), { id: 'a', zone: 'resize' });
    expect(t.byId('a').duration).toBe(960); // end → 1920
    expect(t.s.historyStore.getState().undoLabel).toBe('Resize 1 note');
    t.dragTo(at(1918, 60), at(0, 60), { id: 'a', zone: 'resize' });
    expect(t.byId('a').duration).toBe(240); // one step, not zero
    t.edit().setSnap({ division: null, triplet: false });
    t.dragTo(at(1198, 60), at(-5000, 60), { id: 'a', zone: 'resize' });
    expect(t.byId('a').duration).toBe(1);
    expect(t.undoDepth()).toBe(3);
  });

  it('resizes all selected notes by the same amount', () => {
    const t = setup([n('a', 60, 0, 480), n('b', 64, 960, 960)]);
    t.edit().setSelection(['a', 'b']);
    t.dragTo(at(478, 60), at(718, 60), { id: 'a', zone: 'resize' });
    expect(t.notesNow().map((q) => q.duration)).toEqual([720, 1200]);
  });

  it('growing into a neighbour of the same pitch trims it', () => {
    const t = setup([n('a', 60, 0, 480), n('b', 60, 960, 480)]);
    t.dragTo(at(478, 60), at(1198, 60), { id: 'a', zone: 'resize' });
    expect(t.byId('a').duration).toBe(1200);
    expect(t.byId('b')).toMatchObject({ start: 1200, duration: 240 });
  });
});

describe('selection', () => {
  const notes = [n('a', 60, 0), n('b', 64, 960), n('c', 67, 1920)];

  it('click selects one; shift-click adds and removes; click on a selected note collapses to it', () => {
    const t = setup(notes);
    t.click(at(10, 60), { id: 'a', zone: 'body' });
    expect(t.edit().selection).toEqual(['a']);
    t.click(at(1000, 64, { shift: true }), { id: 'b', zone: 'body' });
    expect(t.edit().selection).toEqual(['a', 'b']);
    t.click(at(10, 60, { shift: true }), { id: 'a', zone: 'body' });
    expect(t.edit().selection).toEqual(['b']);
    t.click(at(1000, 64, { shift: true }), { id: 'b', zone: 'body' });
    expect(t.edit().selection).toEqual([]);
    t.edit().setSelection(['a', 'b']);
    t.click(at(10, 60), { id: 'a', zone: 'body' });
    expect(t.edit().selection).toEqual(['a']);
  });

  it('click on empty space with the select tool clears; with the draw tool it adds instead', () => {
    const t = setup(notes);
    t.edit().setTool('select');
    t.edit().setSelection(['a', 'b']);
    t.click(at(5000, 70));
    expect(t.edit().selection).toEqual([]);
    expect(t.notesNow()).toHaveLength(3);
    t.edit().setTool('draw');
    t.click(at(5000, 70));
    expect(t.notesNow()).toHaveLength(4);
  });

  it('box select (select tool) takes the notes the box touches, live; shift adds to the selection', () => {
    const t = setup(notes);
    t.edit().setTool('select');
    t.edit().press(null, { tick: -50, pitch: 58, row: 58.2, alt: false, shift: false });
    t.edit().drag({ tick: 1200, pitch: 65, row: 65.4, alt: false, shift: false }, true);
    expect(t.edit().selection.sort()).toEqual(['a', 'b']); // already selected while the box is still down
    expect(t.edit().preview?.box).not.toBeNull();
    t.edit().release();
    expect(t.edit().selection.sort()).toEqual(['a', 'b']);
    expect(t.edit().preview).toBeNull();
    expect(t.undoDepth()).toBe(0); // selecting is not an edit

    t.edit().press(null, { tick: 1800, pitch: 66, row: 66.1, alt: false, shift: true });
    t.edit().drag({ tick: 2500, pitch: 68, row: 67.9, alt: false, shift: true }, true);
    t.edit().release();
    expect(t.edit().selection.sort()).toEqual(['a', 'b', 'c']);
  });

  it('in the draw tool, shift-drag on empty space is a box, not a new note', () => {
    const t = setup(notes);
    t.edit().press(null, { tick: -50, pitch: 58, row: 58.2, alt: false, shift: true });
    t.edit().drag({ tick: 100, pitch: 61, row: 60.9, alt: false, shift: true }, true);
    t.edit().release();
    expect(t.edit().selection).toEqual(['a']);
    expect(t.notesNow()).toHaveLength(3);
  });

  it('cancelling a box restores the earlier selection', () => {
    const t = setup(notes);
    t.edit().setTool('select');
    t.edit().setSelection(['c']);
    t.edit().press(null, { tick: -50, pitch: 58, row: 58.2, alt: false, shift: false });
    t.edit().drag({ tick: 1200, pitch: 65, row: 65.4, alt: false, shift: false }, true);
    t.edit().cancelGesture();
    expect(t.edit().selection).toEqual(['c']);
  });

  it('select all, then Escape clears it', () => {
    const t = setup(notes);
    t.edit().runAction({ kind: 'selectAll' });
    expect(t.edit().selection).toHaveLength(3);
    expect(t.edit().status).toBe('Selected all 3 notes');
    t.edit().runAction({ kind: 'deselect' });
    expect(t.edit().selection).toEqual([]);
  });

  it('the selection never holds notes that are gone or on another track', () => {
    const t = setup(notes);
    t.edit().setSelection(['a', 'b']);
    t.edit().runAction({ kind: 'delete' });
    expect(t.edit().selection).toEqual([]);
    t.undo();
    expect(t.edit().selection).toEqual([]); // undo does not resurrect a selection
    t.edit().setSelection(['a']);
    t.s.projectStore.getState().addTrack();
    expect(t.edit().selection).toEqual([]);
  });
});

describe('delete, duplicate, copy, cut, paste', () => {
  const notes = [n('a', 60, 0, 480), n('b', 64, 480, 480), n('c', 67, 3840, 480)];

  it('delete removes the selection as one undoable step', () => {
    const t = setup(notes);
    t.edit().setSelection(['a', 'b']);
    t.edit().runAction({ kind: 'delete' });
    expect(t.notesNow().map((q) => q.id)).toEqual(['c']);
    expect(t.edit().status).toBe('Deleted 2 notes');
    t.undo();
    expect(t.notesNow().map((q) => q.id)).toEqual(['a', 'b', 'c']);
    t.redo();
    expect(t.notesNow().map((q) => q.id)).toEqual(['c']);
  });

  it('delete with nothing selected says so', () => {
    const t = setup(notes);
    t.edit().runAction({ kind: 'delete' });
    expect(t.edit().status).toBe('Nothing to delete');
    expect(t.undoDepth()).toBe(0);
  });

  it('duplicate puts copies right after the selection and selects them', () => {
    const t = setup(notes);
    t.edit().setSelection(['a', 'b']);
    t.edit().runAction({ kind: 'duplicate' });
    expect(t.notesNow()).toHaveLength(5);
    const copies = t.notesNow().filter((q) => !['a', 'b', 'c'].includes(q.id));
    expect(copies.map((q) => [q.pitch, q.start])).toEqual([[60, 960], [64, 1440]]);
    expect(t.edit().selection.sort()).toEqual(copies.map((q) => q.id).sort());
    expect(t.undoDepth()).toBe(1);
    t.undo();
    expect(t.notesNow()).toHaveLength(3);
  });

  it('copy then paste lands at the playhead (not at the old place), selects the new notes', () => {
    const t = setup(notes);
    t.edit().setSelection(['a', 'b']);
    t.edit().runAction({ kind: 'copy' });
    expect(t.edit().clipboard?.notes).toHaveLength(2);
    expect(t.undoDepth()).toBe(0); // copying is not an edit
    t.s.transportStore.getState().seek(7680);
    t.edit().runAction({ kind: 'paste' });
    const pasted = t.notesNow().filter((q) => q.start >= 7680);
    expect(pasted.map((q) => [q.pitch, q.start, q.duration])).toEqual([[60, 7680, 480], [64, 8160, 480]]);
    expect(t.edit().selection.sort()).toEqual(pasted.map((q) => q.id).sort());
    expect(t.notesNow()).toHaveLength(5);
    // Paste again at the same spot: the new copies replace the old ones, nothing overlaps.
    t.edit().runAction({ kind: 'paste' });
    expect(t.notesNow()).toHaveLength(5);
    t.undo();
    t.undo();
    expect(t.notesNow()).toHaveLength(3);
  });

  it('cut removes and keeps a clip, in one step; paste brings it back anywhere, even on another track', () => {
    const t = setup(notes);
    t.edit().setSelection(['c']);
    t.edit().runAction({ kind: 'cut' });
    expect(t.notesNow().map((q) => q.id)).toEqual(['a', 'b']);
    expect(t.undoDepth()).toBe(1);
    t.s.projectStore.getState().addTrack();
    t.s.transportStore.getState().seek(960);
    t.edit().runAction({ kind: 'paste' });
    expect(t.notesNow().map((q) => [q.pitch, q.start])).toEqual([[67, 960]]);
  });

  it('paste with an empty clipboard, or past the end of the song, is announced and changes nothing', () => {
    const t = setup(notes);
    t.edit().runAction({ kind: 'paste' });
    expect(t.edit().status).toBe('Nothing copied yet');
    t.edit().setSelection(['a']);
    t.edit().runAction({ kind: 'copy' });
    t.s.transportStore.getState().seek(SONG + 5000);
    t.edit().runAction({ kind: 'paste' });
    expect(t.notesNow()).toHaveLength(3);
    expect(t.edit().status).toBe('No room to paste here');
  });

  it('duplicate with no room is announced', () => {
    const t = setup([n('z', 60, SONG - 100, 100)]);
    t.edit().setSelection(['z']);
    t.edit().runAction({ kind: 'duplicate' });
    expect(t.edit().status).toBe('No room to duplicate');
    expect(t.notesNow()).toHaveLength(1);
  });
});

describe('transpose and nudge', () => {
  it('arrows transpose by 1 and 12, auditioning the new pitch; repeated presses merge into one step', () => {
    const t = setup([n('a', 60, 0), n('b', 64, 960)]);
    t.edit().setSelection(['a', 'b']);
    t.edit().runAction({ kind: 'transpose', semitones: 1 });
    t.edit().runAction({ kind: 'transpose', semitones: 1 });
    t.edit().runAction({ kind: 'transpose', semitones: 12 });
    expect(t.notesNow().map((q) => q.pitch)).toEqual([74, 78]);
    expect(t.edit().audition?.pitch).toBe(74);
    expect(t.undoDepth()).toBe(1); // one held key = one step
    t.undo();
    expect(t.notesNow().map((q) => q.pitch)).toEqual([60, 64]);
  });

  it('separate key presses (the key was released in between) are separate steps', () => {
    const t = setup([n('a', 60, 0)]);
    t.edit().setSelection(['a']);
    t.edit().runAction({ kind: 'transpose', semitones: 1 });
    t.s.historyStore.getState().endGesture(); // what a keyup does
    t.edit().runAction({ kind: 'transpose', semitones: 1 });
    expect(t.undoDepth()).toBe(2);
  });

  it('stops at the ends of the keyboard and says so', () => {
    const t = setup([n('a', 127, 0)]);
    t.edit().setSelection(['a']);
    t.edit().runAction({ kind: 'transpose', semitones: 1 });
    expect(t.edit().status).toBe('Already at the highest pitch');
    expect(t.undoDepth()).toBe(0);
    t.edit().runAction({ kind: 'transpose', semitones: -12 });
    expect(t.byId('a').pitch).toBe(115);
  });

  it('nudges by the grid step (and a beat with Shift), never before 0', () => {
    const t = setup([n('a', 60, 480)]);
    t.edit().setSelection(['a']);
    t.edit().runAction({ kind: 'nudge', direction: 1, big: false });
    expect(t.byId('a').start).toBe(720);
    t.edit().runAction({ kind: 'nudge', direction: 1, big: true });
    expect(t.byId('a').start).toBe(1680);
    t.edit().runAction({ kind: 'nudge', direction: -1, big: true });
    t.edit().runAction({ kind: 'nudge', direction: -1, big: true });
    expect(t.byId('a').start).toBe(0);
    t.edit().runAction({ kind: 'nudge', direction: -1, big: false });
    expect(t.edit().status).toBe('Already at the start');
  });

  it('nudge follows the snap setting, and 1/16 when snap is off', () => {
    const t = setup([n('a', 60, 0)]);
    t.edit().setSelection(['a']);
    t.edit().setSnap({ division: 8, triplet: true });
    t.edit().runAction({ kind: 'nudge', direction: 1, big: false });
    expect(t.byId('a').start).toBe(320);
    t.edit().setSnap({ division: null, triplet: false });
    t.edit().runAction({ kind: 'nudge', direction: 1, big: false });
    expect(t.byId('a').start).toBe(560);
  });

  it('transposing onto a same-pitch note trims it (overlap policy)', () => {
    const t = setup([n('a', 60, 0, 960), n('b', 61, 480, 960)]);
    t.edit().setSelection(['a']);
    t.edit().runAction({ kind: 'transpose', semitones: 1 });
    expect(t.byId('b')).toMatchObject({ start: 960, duration: 480 });
    t.undo();
    expect(t.byId('b')).toMatchObject({ start: 480, duration: 960 });
    expect(t.byId('a').pitch).toBe(60);
  });
});

describe('keyboard entry (cursor)', () => {
  it('Enter starts it, arrows move it, Enter adds a note and steps on, Escape ends it', () => {
    const t = setup();
    t.edit().runAction({ kind: 'enter' });
    const c0 = t.edit().cursor!;
    expect(c0).not.toBeNull();
    expect(t.edit().status).toMatch(/^Keyboard entry on\./);

    t.edit().runAction({ kind: 'cursor', dPitch: 2, dSteps: 0, big: false });
    expect(t.edit().cursor!.pitch).toBe(c0.pitch + 2);
    t.edit().runAction({ kind: 'cursor', dPitch: 0, dSteps: 1, big: false });
    expect(t.edit().cursor!.tick).toBe(c0.tick + 240);
    t.edit().runAction({ kind: 'cursor', dPitch: 0, dSteps: 1, big: true });
    expect(t.edit().cursor!.tick).toBe(c0.tick + 240 + 960 - 0);

    const here = t.edit().cursor!;
    t.edit().runAction({ kind: 'enter' });
    expect(t.notesNow()).toHaveLength(1);
    expect(t.notesNow()[0]).toMatchObject({ pitch: here.pitch, start: here.tick, duration: 960 });
    expect(t.edit().cursor).toEqual({ tick: here.tick + 960, pitch: here.pitch }); // ready for the next note
    expect(t.edit().selection).toEqual([]);
    expect(t.edit().audition?.pitch).toBe(here.pitch);

    t.edit().runAction({ kind: 'deselect' });
    expect(t.edit().cursor).toBeNull();
    expect(t.edit().status).toBe('Keyboard entry off');
  });

  it('Enter on a note selects it (and again deselects), Delete removes the note under the cursor', () => {
    const t = setup([n('a', 60, 0, 960)]);
    t.edit().runAction({ kind: 'enter' });
    // Put the cursor on the note.
    const c = t.edit().cursor!;
    for (let i = 0; i < Math.abs(c.pitch - 60); i++) t.edit().runAction({ kind: 'cursor', dPitch: c.pitch > 60 ? -1 : 1, dSteps: 0, big: false });
    while (t.edit().cursor!.tick > 0) t.edit().runAction({ kind: 'cursor', dPitch: 0, dSteps: -1, big: false });
    t.edit().runAction({ kind: 'cursor', dPitch: 0, dSteps: -1, big: false }); // already at the start: just re-announces
    expect(t.edit().status).toMatch(/note here$/);
    t.edit().runAction({ kind: 'enter' });
    expect(t.edit().selection).toEqual(['a']);
    t.edit().runAction({ kind: 'enter' });
    expect(t.edit().selection).toEqual([]);
    t.edit().runAction({ kind: 'delete' });
    expect(t.notesNow()).toHaveLength(0);
  });

  it('the cursor stays inside the song and the keyboard', () => {
    const t = setup();
    t.edit().runAction({ kind: 'enter' });
    for (let i = 0; i < 200; i++) t.edit().runAction({ kind: 'cursor', dPitch: 12, dSteps: 0, big: false });
    expect(t.edit().cursor!.pitch).toBe(127);
    for (let i = 0; i < 20; i++) t.edit().runAction({ kind: 'cursor', dPitch: 0, dSteps: -1, big: true });
    expect(t.edit().cursor!.tick).toBe(0);
  });

  it('works end to end through the key decoder', () => {
    const t = setup();
    const press = (key: string, mods = {}) => {
      const a = interpretEditKey({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }, { hasSelection: t.edit().selection.length > 0, cursorActive: t.edit().cursor !== null });
      if (a) t.edit().runAction(a);
      return a;
    };
    expect(press('ArrowUp')).toBeNull(); // no cursor yet: the view scrolls
    press('Enter');
    expect(press('ArrowUp')).not.toBeNull();
    press('Enter');
    expect(t.notesNow()).toHaveLength(1);
  });
});

describe('robustness', () => {
  it('a drag is dropped if the project changes under it', () => {
    const t = setup([n('a', 60, 0)]);
    t.edit().press({ id: 'a', zone: 'body' }, at(10, 60));
    t.edit().drag(at(500, 60), true);
    expect(t.edit().preview).not.toBeNull();
    t.s.projectStore.getState().loadProject({ ...(structuredClone(t.s.projectStore.getState().project) as Project) });
    expect(t.edit().preview).toBeNull();
    t.edit().release();
    expect(t.undoDepth()).toBe(0);
  });

  it('whatever the user does, notes stay valid and same-pitch notes never overlap', () => {
    const t = setup([n('a', 60, 0, 960), n('b', 62, 480, 960), n('c', 60, 1920, 480)]);
    let seed = 99;
    const rnd = (k: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % k;
    };
    for (let i = 0; i < 120; i++) {
      const notes = t.notesNow();
      const pick = notes.length ? notes[rnd(notes.length)]! : null;
      const alt = rnd(3) === 0;
      switch (rnd(7)) {
        case 0:
          t.click(at(rnd(SONG + 2000) - 500, 58 + rnd(8), { alt }));
          break;
        case 1:
          if (pick) t.dragTo(at(pick.start + 5, pick.pitch), at(rnd(SONG) - 200, 55 + rnd(14), { alt }), { id: pick.id, zone: 'body' });
          break;
        case 2:
          if (pick) t.dragTo(at(pick.start + pick.duration - 2, pick.pitch), at(rnd(SONG) - 1000, pick.pitch, { alt }), { id: pick.id, zone: 'resize' });
          break;
        case 3:
          t.edit().setSelection(notes.filter(() => rnd(2) === 0).map((q) => q.id));
          t.edit().runAction({ kind: 'transpose', semitones: [1, -1, 12, -12][rnd(4)]! });
          break;
        case 4:
          t.edit().setSelection(notes.filter(() => rnd(2) === 0).map((q) => q.id));
          t.edit().runAction({ kind: 'nudge', direction: rnd(2) ? 1 : -1, big: rnd(2) === 0 });
          break;
        case 5:
          t.edit().setSelection(notes.filter(() => rnd(3) === 0).map((q) => q.id));
          t.edit().runAction({ kind: rnd(2) ? 'duplicate' : 'delete' });
          break;
        default:
          if (rnd(2)) t.undo();
          else t.redo();
      }
      const now = t.notesNow();
      for (const a of now) {
        expect(a.duration).toBeGreaterThanOrEqual(1);
        expect(a.start).toBeGreaterThanOrEqual(0);
        expect(a.start + a.duration).toBeLessThanOrEqual(SONG);
        expect(a.pitch).toBeGreaterThanOrEqual(0);
        expect(a.pitch).toBeLessThanOrEqual(127);
        for (const b of now) if (a !== b && a.pitch === b.pitch) expect(a.start < b.start + b.duration && b.start < a.start + a.duration).toBe(false);
      }
      t.s.historyStore.getState().endGesture();
    }
    expect(t.undoDepth()).toBeLessThan(200); // nothing fell off the end of the history
    // Everything can be undone to the starting notes.
    while (t.s.historyStore.history.undo());
    expect(t.notesNow().map((q) => q.id)).toEqual(['a', 'b', 'c']);
    expect(t.byId('a')).toMatchObject({ pitch: 60, start: 0, duration: 960 });
  });
});
