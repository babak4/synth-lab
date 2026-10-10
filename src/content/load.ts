/** Loads the bundled help content (browser side). Content is validated at build time by `npm run content`. */
import { parseEntry, parseGlossary, type Glossary, type HelpEntry } from './schema';

const md = import.meta.glob('/content/help/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const gl = import.meta.glob('/content/help/glossary.yml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface HelpContent {
  entries: ReadonlyMap<string, HelpEntry>;
  glossary: Glossary;
}

function load(): HelpContent {
  const entries = new Map<string, HelpEntry>();
  for (const [path, raw] of Object.entries(md)) {
    const p = parseEntry(raw, path);
    if (p.ok) entries.set(p.entry.id, p.entry);
    else console.error(p.error); // unreachable once `npm run content` passes
  }
  const g = Object.values(gl)[0];
  const parsed = g ? parseGlossary(g) : null;
  return { entries, glossary: parsed?.ok ? parsed.glossary : {} };
}

export const HELP: HelpContent = load();
