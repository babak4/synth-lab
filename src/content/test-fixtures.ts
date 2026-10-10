/** Valid stub help content generated from the real registry, for testing the validator. */
import { CONTROL_HELP_IDS, PARAM_DEFS, SECTION_HELP_IDS } from '@/core/params/registry';
import { FACTORY_PRESETS } from '@/presets';
import { REQUIRED_BEYOND, SECTION_HEADINGS, type ContentFile, type ContentInput } from './validate';

const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');

export function sectionStub(id: string, over: { extraBody?: string; skipHeading?: string; frontMatter?: string; beyond?: string } = {}): ContentFile {
  const beyond = over.beyond ?? `Bigger synths go further here: ${(REQUIRED_BEYOND[id] ?? []).join(', ')}.`;
  const parts: Record<string, string> = {
    'What it is': 'This is a short and simple plain description of the thing.',
    "What you'll hear": 'You will hear a clear change in the sound when it moves.',
    'Try this': 'Move the control and listen to what happens next.',
    'The controls': '- Each control has a line.',
    'Beyond this synth': beyond,
    "Where you've heard it": 'You have heard it in many songs.',
    Related: 'See the neighbouring entries.',
  };
  const body = SECTION_HEADINGS.filter((h) => h !== over.skipHeading).map((h) => `## ${h}\n\n${parts[h]}\n`).join('\n');
  const front = over.frontMatter ?? `id: ${id}\ntitle: ${id}\nkind: section\nrelated: []\npresets: []\ntryThis:\n  - title: One\n    description: Try it.\n    patch: { filter-cutoff: 500 }\n  - title: Two\n    description: Try it again.\n    patch: { filter-type: highpass }`;
  return { path: `sections/${id}.md`, raw: `---\n${front}\n---\n${body}\n${over.extraBody ?? ''}\n${words(130)}` };
}

export function controlStub(id: string, over: { body?: string; frontMatter?: string } = {}): ContentFile {
  const body = over.body ?? `**What it does.** It changes the sound in a simple way that you can hear.\n\n**Range.** From low to high.\n\n**Tip.** Try moving it slowly while a note is held.`;
  return { path: `controls/${id}.md`, raw: `---\n${over.frontMatter ?? `id: ${id}\ntitle: ${id}\nkind: control\nrelated: []\npresets: []`}\n---\n${body}\n` };
}

export const GLOSSARY = 'harmonic:\n  term: Harmonic\n  definition: A whole-number multiple of the base frequency.\n';

export function stubContent(): ContentInput {
  return {
    files: [...SECTION_HELP_IDS.map((id) => sectionStub(id)), ...CONTROL_HELP_IDS.map((id) => controlStub(id))],
    glossary: GLOSSARY,
    controlHelpIds: CONTROL_HELP_IDS,
    sectionHelpIds: SECTION_HELP_IDS,
    params: PARAM_DEFS,
    presetIds: FACTORY_PRESETS.map((p) => p.id),
  };
}

/** Replace (or add) one file in a content set. */
export function withFile(input: ContentInput, file: ContentFile): ContentInput {
  return { ...input, files: [...input.files.filter((f) => f.path !== file.path), file] };
}
export const withoutFile = (input: ContentInput, path: string): ContentInput => ({ ...input, files: input.files.filter((f) => f.path !== path) });
