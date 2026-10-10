import { describe, expect, it } from 'vitest';
import { createProject } from '@/core/contracts/project';
import { serialiseProject } from '@/core/project-file';
import { createProjectFileStore, hasUnsavedChanges } from './project-file-store';
import { createProjectStore } from './project-store';

function setup() {
  const projectStore = createProjectStore();
  const files = createProjectFileStore({ projectStore, now: () => new Date('2026-05-05T10:00:00Z') });
  return { projectStore, files };
}

describe('project file store', () => {
  it('starts clean; an edit makes the project unsaved', () => {
    const { projectStore, files } = setup();
    expect(hasUnsavedChanges(projectStore.getState().project, files.getState().baseline)).toBe(false);
    projectStore.getState().setTempo(100);
    expect(hasUnsavedChanges(projectStore.getState().project, files.getState().baseline)).toBe(true);
  });

  it('saving to a file marks the project clean and returns the file text and name', () => {
    const { projectStore, files } = setup();
    files.getState().rename('Morning');
    projectStore.getState().setTempo(100);
    const { filename, text } = files.getState().saveToFile();
    expect(filename).toBe('morning.synthlab.json');
    expect(text).toBe(serialiseProject(projectStore.getState().project, new Date('2026-05-05T10:00:00Z')));
    expect(hasUnsavedChanges(projectStore.getState().project, files.getState().baseline)).toBe(false);
    expect(files.getState().message).toEqual({ kind: 'info', text: 'Saved as morning.synthlab.json.' });
  });

  it('opening a valid file replaces the project and is clean', () => {
    const { projectStore, files } = setup();
    const incoming = { ...createProject(), name: 'Opened', tempo: 72 };
    expect(files.getState().openText(serialiseProject(incoming))).toBe(true);
    expect(projectStore.getState().project.name).toBe('Opened');
    expect(projectStore.getState().project.tempo).toBe(72);
    expect(hasUnsavedChanges(projectStore.getState().project, files.getState().baseline)).toBe(false);
    expect(files.getState().message?.text).toBe('Opened “Opened”.');
  });

  it('opening an invalid file says why and changes nothing', () => {
    const { projectStore, files } = setup();
    projectStore.getState().setTempo(150);
    const before = projectStore.getState().project;
    expect(files.getState().openText('{"format":')).toBe(false);
    expect(projectStore.getState().project).toBe(before);
    expect(files.getState().message).toEqual({
      kind: 'error',
      text: expect.stringContaining('Could not open this file: the file is not valid JSON'),
    });
    expect(files.getState().message?.text).toContain('Nothing was changed.');
  });

  it('a file with a bad field is refused with the field named', () => {
    const { projectStore, files } = setup();
    const before = projectStore.getState().project;
    const bad = { ...createProject(), tempo: 9999 };
    expect(files.getState().openText(serialiseProject(bad))).toBe(false);
    expect(projectStore.getState().project).toBe(before);
    expect(files.getState().message?.text).toContain('tempo');
  });

  it('new project resets to a fresh, clean project', () => {
    const { projectStore, files } = setup();
    projectStore.getState().addTrack();
    files.getState().newProject();
    expect(projectStore.getState().project.tracks).toHaveLength(1);
    expect(hasUnsavedChanges(projectStore.getState().project, files.getState().baseline)).toBe(false);
  });

  it('rename trims, ignores empty names, and counts as an edit', () => {
    const { projectStore, files } = setup();
    files.getState().rename('  Lead line  ');
    expect(projectStore.getState().project.name).toBe('Lead line');
    files.getState().rename('   ');
    expect(projectStore.getState().project.name).toBe('Lead line');
    expect(files.getState().message?.kind).toBe('error');
    expect(hasUnsavedChanges(projectStore.getState().project, files.getState().baseline)).toBe(true);
  });
});
