/**
 * "New / open / save as file / name" (plan T5.7). Tracks which project the user last opened, created or
 * saved to a file (the baseline); anything different from it is "unsaved", which is what New project
 * asks about. Autosave is separate: it keeps the browser copy current, not a file.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createProject, type Project } from '@/core/contracts/project';
import { parseProjectFile, projectFileName, serialiseProject } from '@/core/project-file';
import type { ProjectStore } from './project-store';

export const PROJECT_NAME_MAX = 80;

export interface ProjectFileState {
  /** The project as last opened, created or saved to a file. */
  baseline: Project;
  message: { kind: 'info' | 'error'; text: string } | null;
  newProject(): void;
  /** Validate and open the text of a project file. A bad file changes nothing. */
  openText(text: string): boolean;
  /** The file to download for the current project; the project then counts as saved. */
  saveToFile(): { filename: string; text: string };
  rename(name: string): void;
}

export type ProjectFileStore = StoreApi<ProjectFileState>;

/** True when the project differs from the one last opened, created or saved to a file. */
export function hasUnsavedChanges(project: Project, baseline: Project): boolean {
  return project !== baseline;
}

export function createProjectFileStore(deps: { projectStore: ProjectStore; now?: () => Date }): ProjectFileStore {
  const { projectStore } = deps;
  const now = deps.now ?? (() => new Date());

  return createStore<ProjectFileState>()((set) => ({
    baseline: projectStore.getState().project,
    message: null,

    newProject() {
      projectStore.getState().loadProject(createProject());
      set({ baseline: projectStore.getState().project, message: { kind: 'info', text: 'Started a new project.' } });
    },

    openText(text) {
      const r = parseProjectFile(text);
      if (!r.ok) {
        set({ message: { kind: 'error', text: `Could not open this file: ${r.error}. Nothing was changed.` } });
        return false;
      }
      projectStore.getState().loadProject(r.value);
      set({ baseline: projectStore.getState().project, message: { kind: 'info', text: `Opened “${r.value.name}”.` } });
      return true;
    },

    saveToFile() {
      const project = projectStore.getState().project;
      const filename = projectFileName(project.name);
      set({ baseline: project, message: { kind: 'info', text: `Saved as ${filename}.` } });
      return { filename, text: serialiseProject(project, now()) };
    },

    rename(name) {
      const trimmed = name.trim().slice(0, PROJECT_NAME_MAX);
      if (!trimmed) {
        set({ message: { kind: 'error', text: 'The project needs a name.' } });
        return;
      }
      const p = projectStore.getState().project;
      if (trimmed !== p.name) projectStore.setState({ project: { ...p, name: trimmed } });
    },
  }));
}
