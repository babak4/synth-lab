import { describe, expect, it, vi } from 'vitest';
import { MAX_TRACKS, createProject } from '@/core/contracts/project';
import { createPatchStore } from './patch-store';
import { bindPatchToProject, createProjectStore, selectedTrack } from './project-store';

describe('project store', () => {
  it('starts with one selected track and clamps the tempo', () => {
    const s = createProjectStore();
    expect(s.getState().project.tracks).toHaveLength(1);
    expect(s.getState().selectedTrackId).toBe(s.getState().project.tracks[0]!.id);
    s.getState().setTempo(999);
    expect(s.getState().project.tempo).toBe(240);
    s.getState().setTempo(3);
    expect(s.getState().project.tempo).toBe(40);
    s.getState().setTempo(Number.NaN);
    expect(s.getState().project.tempo).toBe(40);
    s.getState().setTempo(97.6);
    expect(s.getState().project.tempo).toBe(98);
  });

  it('adding selects the new track, up to the maximum', () => {
    const s = createProjectStore();
    for (let i = 0; i < 12; i++) s.getState().addTrack();
    expect(s.getState().project.tracks).toHaveLength(MAX_TRACKS);
    expect(s.getState().selectedTrackId).toBe(s.getState().project.tracks.at(-1)!.id);
  });

  it('duplicating selects the copy; deleting the selected track selects its neighbour', () => {
    const s = createProjectStore();
    s.getState().addTrack();
    s.getState().addTrack();
    const [a, b, c] = s.getState().project.tracks.map((t) => t.id) as [string, string, string];
    s.getState().duplicateTrack(a);
    const copy = s.getState().project.tracks[1]!;
    expect(copy.id).not.toBe(a);
    expect(s.getState().selectedTrackId).toBe(copy.id);
    s.getState().removeTrack(copy.id);
    expect(s.getState().selectedTrackId).toBe(b);
    s.getState().selectTrack(c);
    s.getState().removeTrack(c);
    expect(s.getState().selectedTrackId).toBe(b); // the last one goes: fall back to the previous
    s.getState().removeTrack(b);
    s.getState().removeTrack(a);
    expect(s.getState().project.tracks).toHaveLength(1);
  });

  it('deleting an unselected track keeps the selection', () => {
    const s = createProjectStore();
    s.getState().addTrack();
    const [a, b] = s.getState().project.tracks.map((t) => t.id) as [string, string];
    s.getState().selectTrack(a);
    s.getState().removeTrack(b);
    expect(s.getState().selectedTrackId).toBe(a);
  });

  it('keeps the loop inside the song when the length changes', () => {
    const s = createProjectStore();
    s.getState().setLengthBars(16);
    expect(s.getState().project.loop).toMatchObject({ startBar: 0, endBar: 16 }); // followed the song
    s.getState().setLoop({ startBar: 4, endBar: 8 });
    s.getState().setLengthBars(6);
    expect(s.getState().project.loop).toMatchObject({ startBar: 4, endBar: 6 });
    s.getState().setLoop({ startBar: 9, endBar: 3 });
    const { startBar, endBar } = s.getState().project.loop;
    expect(startBar).toBeLessThan(endBar);
    expect(endBar).toBeLessThanOrEqual(6);
  });

  it('track fader, mute, solo and rename', () => {
    const s = createProjectStore();
    const id = s.getState().selectedTrackId;
    s.getState().setTrackVolume(id, -200);
    s.getState().setTrackMute(id, true);
    s.getState().setTrackSolo(id, true);
    s.getState().renameTrack(id, '  Bass  ');
    s.getState().renameTrack(id, '   ');
    expect(selectedTrack(s.getState())).toMatchObject({ volumeDb: -60, mute: true, solo: true, name: 'Bass' });
  });
});

describe('bindPatchToProject (edit sound)', () => {
  const setup = () => {
    const project = createProjectStore();
    const patch = createPatchStore();
    const onSwitch = vi.fn();
    bindPatchToProject(patch, project, onSwitch);
    return { project, patch, onSwitch };
  };

  it('edits go to the selected track only', () => {
    const { project, patch } = setup();
    project.getState().addTrack();
    const [a, b] = project.getState().project.tracks;
    patch.getState().setParam('filter-cutoff', 1234);
    expect(project.getState().project.tracks.find((t) => t.id === b!.id)!.patch.params['filter-cutoff']).toBe(1234);
    expect(project.getState().project.tracks.find((t) => t.id === a!.id)!.patch.params['filter-cutoff']).toBe(8000);
  });

  it('selecting another track swaps the editor patch and keeps each sound', () => {
    const { project, patch, onSwitch } = setup();
    const a = project.getState().selectedTrackId;
    patch.getState().setParam('filter-cutoff', 500);
    project.getState().addTrack();
    expect(patch.getState().patch.params['filter-cutoff']).toBe(8000); // a fresh track
    expect(onSwitch).toHaveBeenCalledTimes(1);
    patch.getState().setParam('filter-cutoff', 900);
    project.getState().selectTrack(a);
    expect(patch.getState().patch.params['filter-cutoff']).toBe(500);
    project.getState().selectTrack(project.getState().project.tracks[1]!.id);
    expect(patch.getState().patch.params['filter-cutoff']).toBe(900);
    expect(onSwitch).toHaveBeenCalledTimes(3);
  });

  it('deleting the selected track loads the neighbour into the editor; duplicates start with the same sound', () => {
    const { project, patch } = setup();
    patch.getState().setParam('filter-cutoff', 700);
    project.getState().duplicateTrack(project.getState().selectedTrackId);
    expect(patch.getState().patch.params['filter-cutoff']).toBe(700);
    patch.getState().setParam('filter-cutoff', 300);
    project.getState().removeTrack(project.getState().selectedTrackId);
    expect(patch.getState().patch.params['filter-cutoff']).toBe(700);
  });

  it('opening a project loads its first track', () => {
    const { project, patch } = setup();
    const p = createProject();
    p.tracks[0]!.patch = { ...p.tracks[0]!.patch, params: { ...p.tracks[0]!.patch.params, 'filter-cutoff': 321 } };
    project.getState().loadProject(p);
    expect(patch.getState().patch.params['filter-cutoff']).toBe(321);
  });
});
