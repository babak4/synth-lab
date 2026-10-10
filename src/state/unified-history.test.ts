import { describe, expect, it } from 'vitest';
import { createMockServices } from '@/app/mock-services';
import { createProject, type Note } from '@/core/contracts/project';

const note = (id: string, pitch: number, start: number, duration = 480): Note => ({ id, pitch, start, duration, velocity: 100 });

function setup() {
  const s = createMockServices();
  const track = () => s.projectStore.getState().project.tracks.find((t) => t.id === s.projectStore.getState().selectedTrackId)!;
  const cutoff = () => s.patchStore.getState().patch.params['filter-cutoff'];
  return { s, track, cutoff };
}

describe('one undo stack for sound and notes', () => {
  it('undoes sound edits and note edits in the order they happened', () => {
    const { s, track, cutoff } = setup();
    s.patchStore.getState().setParam('filter-cutoff', 1000);
    s.historyStore.getState().endGesture();
    s.pianoRollEdit.getState().press(null, { tick: 0, pitch: 60, row: 60.5, alt: false, shift: false });
    s.pianoRollEdit.getState().release();
    expect(track().notes).toHaveLength(1);
    expect(s.historyStore.getState().undoLabel).toBe('Add note');

    s.historyStore.getState().undo();
    expect(track().notes).toHaveLength(0);
    expect(cutoff()).toBe(1000); // the sound edit is still there
    s.historyStore.getState().undo();
    expect(cutoff()).toBe(8000);
    s.historyStore.getState().redo();
    expect(cutoff()).toBe(1000);
    s.historyStore.getState().redo();
    expect(track().notes).toHaveLength(1);
  });

  it('switching tracks no longer clears history, and undo goes to the track the step belongs to', () => {
    const { s, cutoff } = setup();
    const first = s.projectStore.getState().selectedTrackId;
    s.patchStore.getState().setParam('filter-cutoff', 1000); // on track 1
    s.historyStore.getState().endGesture();
    s.projectStore.getState().addTrack(); // selects track 2
    expect(s.projectStore.getState().selectedTrackId).not.toBe(first);
    expect(s.historyStore.getState().canUndo).toBe(true);
    expect(cutoff()).toBe(8000); // track 2's own sound

    s.patchStore.getState().setParam('filter-cutoff', 300); // on track 2
    s.historyStore.getState().endGesture();
    s.historyStore.getState().undo(); // track 2's edit
    expect(cutoff()).toBe(8000);
    s.historyStore.getState().undo(); // track 1's edit: track 1 is selected so the change is visible
    expect(s.projectStore.getState().selectedTrackId).toBe(first);
    expect(cutoff()).toBe(8000);
    s.historyStore.getState().redo();
    expect(s.projectStore.getState().selectedTrackId).toBe(first);
    expect(cutoff()).toBe(1000);
    // Track 2 was never touched by track 1's steps.
    const second = s.projectStore.getState().project.tracks[1]!;
    expect(second.patch.params['filter-cutoff']).toBe(8000);
  });

  it('coalescing keys are per track: two tracks\' drags of one knob are not merged', () => {
    const { s } = setup();
    s.patchStore.getState().setParam('filter-cutoff', 1000);
    s.projectStore.getState().addTrack();
    s.patchStore.getState().setParam('filter-cutoff', 500);
    expect(s.historyStore.history.snapshot().undoDepth).toBe(2);
  });

  it('opening or creating a project ends history', () => {
    const { s } = setup();
    s.patchStore.getState().setParam('filter-cutoff', 1000);
    expect(s.historyStore.getState().canUndo).toBe(true);
    s.projectFileStore.getState().newProject();
    expect(s.historyStore.getState().canUndo).toBe(false);
    expect(s.historyStore.getState().canRedo).toBe(false);

    s.patchStore.getState().setParam('filter-cutoff', 2000);
    const other = createProject();
    s.projectStore.getState().loadProject(other);
    expect(s.historyStore.getState().canUndo).toBe(false);
  });

  it('removing a track clears history (its steps would no longer apply)', () => {
    const { s } = setup();
    s.projectStore.getState().addTrack();
    s.patchStore.getState().setParam('filter-cutoff', 1000);
    expect(s.historyStore.getState().canUndo).toBe(true);
    s.projectStore.getState().removeTrack(s.projectStore.getState().selectedTrackId);
    expect(s.historyStore.getState().canUndo).toBe(false);
  });

  it('adding, renaming and reordering tracks leave history alone', () => {
    const { s } = setup();
    s.patchStore.getState().setParam('filter-cutoff', 1000);
    s.projectStore.getState().addTrack();
    s.projectStore.getState().renameTrack(s.projectStore.getState().selectedTrackId, 'Bass');
    s.projectStore.getState().moveTrack(s.projectStore.getState().selectedTrackId, 0);
    expect(s.historyStore.history.snapshot().undoDepth).toBe(1);
  });

  it('a project edit made behind history\'s back (a note recorded some other way) does not break a later undo of notes', () => {
    const { s, track } = setup();
    const ed = s.pianoRollEdit.getState();
    ed.press(null, { tick: 0, pitch: 60, row: 60.5, alt: false, shift: false });
    s.pianoRollEdit.getState().release();
    const id = track().notes[0]!.id;
    // Something else (a recorder) adds a note directly.
    const p = s.projectStore.getState().project;
    s.projectStore.setState({ project: { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, notes: [...t.notes, note('rec', 64, 960)] } : t)) } });
    s.historyStore.getState().undo();
    expect(track().notes.map((n) => n.id)).toEqual(['rec']); // the diff removed only what it added
    expect(id).not.toBe('rec');
  });
});
