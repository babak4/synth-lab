import { describe, expect, it } from 'vitest';
import { createProject, PROJECT_SCHEMA_VERSION, type Project } from './contracts/project';
import { parseProjectData, parseProjectFile, projectFileName, serialiseProject } from './project-file';

const sample = (): Project => {
  const p = createProject();
  return { ...p, name: 'Night drive', tempo: 96, tracks: [{ ...p.tracks[0]!, name: 'Bass', notes: [{ id: 'n1', pitch: 40, start: 0, duration: 480, velocity: 100 }] }] };
};

describe('project file format', () => {
  it('round-trips a project exactly', () => {
    const p = sample();
    const r = parseProjectFile(serialiseProject(p));
    expect(r).toEqual({ ok: true, value: p });
  });

  it('writes an envelope that names the format and version', () => {
    const file = JSON.parse(serialiseProject(sample(), new Date('2026-01-02T03:04:05Z')));
    expect(file.format).toBe('synth-lab-project');
    expect(file.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(file.savedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(file.project.name).toBe('Night drive');
  });

  it('explains bad JSON', () => {
    const r = parseProjectFile('{"format": "synth-lab-pro');
    expect(r).toEqual({ ok: false, error: expect.stringContaining('not valid JSON') });
  });

  it('rejects files that are not Synth Lab projects', () => {
    expect(parseProjectFile('[1,2,3]')).toEqual({ ok: false, error: 'this is not a Synth Lab project file' });
    expect(parseProjectFile(JSON.stringify({ format: 'something-else', project: sample() }))).toEqual({
      ok: false,
      error: 'this is not a Synth Lab project file',
    });
    expect(parseProjectFile('null')).toEqual({ ok: false, error: 'this is not a Synth Lab project file' });
  });

  it('says when the file came from a newer version', () => {
    const file = { format: 'synth-lab-project', schemaVersion: 2, savedAt: '', project: sample() };
    const r = parseProjectFile(JSON.stringify(file));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('newer version of Synth Lab (file format 2; this version reads format 1)');
  });

  it('rejects a missing or malformed format version', () => {
    const base = { format: 'synth-lab-project', project: sample() };
    expect(parseProjectFile(JSON.stringify(base))).toEqual({ ok: false, error: 'the file has no valid format version' });
    expect(parseProjectFile(JSON.stringify({ ...base, schemaVersion: 1.5 }))).toEqual({
      ok: false,
      error: 'the file has no valid format version',
    });
  });

  it('says when the envelope has no project', () => {
    expect(parseProjectFile(JSON.stringify({ format: 'synth-lab-project', schemaVersion: 1 }))).toEqual({
      ok: false,
      error: 'the file contains no project',
    });
  });

  it('names the invalid field in human terms', () => {
    const p = sample();
    const broken = { ...p, tracks: [{ ...p.tracks[0]!, volumeDb: 20 }] };
    const r = parseProjectFile(JSON.stringify({ format: 'synth-lab-project', schemaVersion: 1, project: broken }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Track 1 › volumeDb: /);
  });

  it('reports at most five problems and says how many were left out', () => {
    const p = sample();
    const notes = Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, pitch: 200, start: 0, duration: 1, velocity: 1 }));
    const r = parseProjectData({ ...p, tracks: [{ ...p.tracks[0]!, notes }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Track 1 › Note 1 › pitch');
      expect(r.error).toMatch(/; and \d+ more$/);
    }
  });

  it('validates stored data the same way (autosave restore)', () => {
    expect(parseProjectData(sample()).ok).toBe(true);
    expect(parseProjectData('garbage').ok).toBe(false);
    expect(parseProjectData({ schemaVersion: 0 }).ok).toBe(false);
  });
});

describe('projectFileName', () => {
  it('slugifies the project name', () => {
    expect(projectFileName('My song!')).toBe('my-song.synthlab.json');
    expect(projectFileName('  Café  Déjà vu ')).toBe('cafe-deja-vu.synthlab.json');
  });

  it('falls back when nothing usable is left', () => {
    expect(projectFileName('???')).toBe('project.synthlab.json');
    expect(projectFileName('')).toBe('project.synthlab.json');
  });
});
