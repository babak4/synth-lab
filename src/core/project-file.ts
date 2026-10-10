/**
 * Project files (plan T5.7, PRD §6.5): the `.synthlab.json` format used by Save file… / Open file…,
 * and the validation shared with browser autosave. Pure: no DOM, no storage.
 *
 * File shape: { format, schemaVersion, savedAt, project }. The envelope lets an import tell "this is
 * not a Synth Lab project" apart from "this is one, but the content is wrong".
 */
import { PROJECT_SCHEMA_VERSION, ProjectSchema, migrateProject, type Project } from './contracts/project';

export const PROJECT_FILE_FORMAT = 'synth-lab-project';
export const PROJECT_FILE_EXTENSION = '.synthlab.json';

export interface ProjectFile {
  format: typeof PROJECT_FILE_FORMAT;
  schemaVersion: number;
  savedAt: string;
  project: Project;
}

export type ProjectParseResult = { ok: true; value: Project } | { ok: false; error: string };

/** Serialise a project as a file. Pretty-printed so a saved file can be read and diffed by hand. */
export function serialiseProject(project: Project, savedAt: Date = new Date()): string {
  const file: ProjectFile = {
    format: PROJECT_FILE_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    savedAt: savedAt.toISOString(),
    project,
  };
  return JSON.stringify(file, null, 2);
}

/** "My song!" → "my-song.synthlab.json"; falls back to "project" for an empty or symbol-only name. */
export function projectFileName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'project'}${PROJECT_FILE_EXTENSION}`;
}

/** Labels for zod path segments that read badly as raw keys. */
const LABELS: Record<string, string> = {
  tracks: 'Track',
  notes: 'Note',
  patch: 'Sound',
  params: 'Setting',
  timeSignature: 'Time signature',
  loop: 'Loop',
};

/** "tracks.0.name" → "Track 1 › name"; a numeric segment becomes the 1-based number of the item before it. */
function describePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return 'Project';
  const parts: string[] = [];
  for (const seg of path) {
    if (typeof seg === 'number') {
      const last = parts.length - 1;
      if (last >= 0) parts[last] = `${parts[last]} ${seg + 1}`;
      else parts.push(String(seg + 1));
    } else {
      parts.push(LABELS[String(seg)] ?? String(seg));
    }
  }
  return parts.join(' › ');
}

/** zod's type messages, reworded: "expected number, received undefined" → "is missing". */
function plainMessage(message: string): string {
  const type = /^Invalid input: expected (.+), received (.+)$/.exec(message);
  if (type) return type[2] === 'undefined' ? 'is missing' : `should be ${type[1]} (found ${type[2]})`;
  const max = /^Too big: expected .* to be <=(.+)$/.exec(message);
  if (max) return `must be at most ${max[1]}`;
  const min = /^Too small: expected .* to be >=(.+)$/.exec(message);
  if (min) return `must be at least ${min[1]}`;
  return message;
}

/**
 * Validate project data (from a file or from autosave storage). Returns readable messages, one per
 * problem (at most five), joined with "; ". Runs the migration hook first.
 */
export function parseProjectData(raw: unknown): ProjectParseResult {
  const r = ProjectSchema.safeParse(migrateProject(raw));
  if (r.success) return { ok: true, value: r.data };
  const problems = r.error.issues.map((i) => `${describePath(i.path)}: ${plainMessage(i.message)}`);
  const shown = problems.slice(0, 5).join('; ');
  return { ok: false, error: problems.length > 5 ? `${shown}; and ${problems.length - 5} more` : shown };
}

/** Parse the text of a project file. Every failure is a sentence a person can act on. */
export function parseProjectFile(text: string): ProjectParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'the file is not valid JSON (it may be truncated or not a project file)' };
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== PROJECT_FILE_FORMAT) {
    return { ok: false, error: 'this is not a Synth Lab project file' };
  }
  const file = raw as Partial<ProjectFile>;
  if (typeof file.schemaVersion !== 'number' || !Number.isInteger(file.schemaVersion) || file.schemaVersion < 1) {
    return { ok: false, error: 'the file has no valid format version' };
  }
  if (file.schemaVersion > PROJECT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `it was saved by a newer version of Synth Lab (file format ${file.schemaVersion}; this version reads format ${PROJECT_SCHEMA_VERSION})`,
    };
  }
  if (file.project === undefined) return { ok: false, error: 'the file contains no project' };
  return parseProjectData(file.project);
}
