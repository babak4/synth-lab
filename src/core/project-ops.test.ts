import { describe, expect, it } from 'vitest';
import { MAX_TRACKS, createProject } from './contracts/project';
import { addTrack, duplicateTrack, moveTrack, removeTrack, updateTrack } from './project-ops';

const withTracks = (n: number) => {
  let p = createProject();
  while (p.tracks.length < n) p = addTrack(p);
  return p;
};

describe('project ops', () => {
  it('adds tracks up to the maximum, then refuses', () => {
    const p = withTracks(MAX_TRACKS);
    expect(p.tracks).toHaveLength(MAX_TRACKS);
    expect(addTrack(p)).toBe(p);
    expect(new Set(p.tracks.map((t) => t.id)).size).toBe(MAX_TRACKS);
    expect(new Set(p.tracks.map((t) => t.colour)).size).toBe(MAX_TRACKS);
  });

  it('duplicates a track after the original with its own ids, not shared objects', () => {
    let p = withTracks(2);
    const src = p.tracks[0]!;
    p = updateTrack(p, src.id, { notes: [{ id: 'n1', pitch: 60, start: 0, duration: 480, velocity: 90 }], solo: true, volumeDb: -4 });
    const out = duplicateTrack(p, src.id);
    const copy = out.tracks[1]!;
    expect(out.tracks).toHaveLength(3);
    expect(copy.id).not.toBe(src.id);
    expect(copy.name).toBe('Track 1 copy');
    expect(copy.volumeDb).toBe(-4);
    expect(copy.solo).toBe(false);
    expect(copy.notes[0]).toMatchObject({ pitch: 60, start: 0 });
    expect(copy.notes[0]!.id).not.toBe('n1');
    expect(copy.patch).not.toBe(p.tracks[0]!.patch);
    expect(copy.patch).toEqual(p.tracks[0]!.patch);
  });

  it('refuses to duplicate past the maximum or an unknown track', () => {
    const p = withTracks(MAX_TRACKS);
    expect(duplicateTrack(p, p.tracks[0]!.id)).toBe(p);
    expect(duplicateTrack(withTracks(2), 'nope').tracks).toHaveLength(2);
  });

  it('removes tracks but always keeps one', () => {
    const p = withTracks(2);
    const out = removeTrack(p, p.tracks[0]!.id);
    expect(out.tracks.map((t) => t.id)).toEqual([p.tracks[1]!.id]);
    expect(removeTrack(out, out.tracks[0]!.id)).toBe(out);
    expect(removeTrack(p, 'nope')).toBe(p);
  });

  it('reorders tracks and clamps the destination', () => {
    const p = withTracks(3);
    const [a, b, c] = p.tracks.map((t) => t.id);
    expect(moveTrack(p, a!, 2).tracks.map((t) => t.id)).toEqual([b, c, a]);
    expect(moveTrack(p, c!, -5).tracks.map((t) => t.id)).toEqual([c, a, b]);
    expect(moveTrack(p, a!, 0)).toBe(p);
  });
});
