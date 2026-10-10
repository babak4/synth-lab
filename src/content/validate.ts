/**
 * Help-content validation (plan T4.2, PRD §4.4). Pure: takes file contents and the registry facts,
 * returns errors (fail the build) and warnings (print only). Run by scripts/check-content.ts in CI and
 * unit-tested against deliberately broken fixtures.
 */
import type { ParamDef } from '@/core/params/types';
import { collectLinks, inlineText, proseText, wordCount, type Block } from './markdown';
import { fleschKincaidGrade } from './readability';
import { parseEntry, parseGlossary, type Glossary, type HelpEntry } from './schema';

export interface ContentFile {
  /** Path relative to content/help, e.g. "sections/filter.md". */
  path: string;
  raw: string;
}

export interface ContentInput {
  files: ContentFile[];
  /** Raw glossary.yml, or null if missing. */
  glossary: string | null;
  /** Every registry control's help id. */
  controlHelpIds: readonly string[];
  /** Every section help id (long entries). */
  sectionHelpIds: readonly string[];
  params: readonly ParamDef[];
  presetIds: readonly string[];
}

export interface Report {
  errors: string[];
  warnings: string[];
  entries: Map<string, HelpEntry>;
  glossary: Glossary;
}

/** The required H2 headings of a section entry, in order (PRD §4.2). */
export const SECTION_HEADINGS = ['What it is', "What you'll hear", 'Try this', 'The controls', 'Beyond this synth', "Where you've heard it", 'Related'] as const;

/** Short control entries lead each paragraph with one of these (PRD §4.2). */
export const CONTROL_LEADS = ['**What it does.**', '**Range.**', '**Tip.**'] as const;

/** Minimum content for "Beyond this synth" per entry, drawn from the table in PRD §4.3 (case-insensitive). */
export const REQUIRED_BEYOND: Readonly<Record<string, readonly string[]>> = {
  oscillators: ['wavetable', 'FM', 'additive', 'granular', 'unison', 'hard sync', 'anti-aliasing'],
  mixer: ['filter', 'drive'],
  filter: ['Moog', '24 dB', 'state-variable', 'self-oscillat'],
  envelopes: ['multi-stage', 'MSEG', 'curve', 'loop'],
  lfo: ['mod matrix', 'audio-rate', 'macro'],
  voicing: ['paraphonic', 'MPE', 'arpeggiator'],
  effects: ['chorus', 'phaser', 'compressor', 'reorder'],
  master: ['oversampling'],
  keyboard: ['aftertouch', 'MPE', 'MIDI'],
  composition: ['automation', 'quantise', 'step sequencer', 'MIDI export'],
};

/** American spellings that must not appear (plain British English, PRD §4.4). */
const AMERICAN: [RegExp, string][] = [
  [/\bcolor(s|ed|ing)?\b/i, 'color → colour'],
  [/\bbehavior/i, 'behavior → behaviour'],
  [/\bcenter(s|ed|ing)?\b/i, 'center → centre'],
  [/\banalyz/i, 'analyze → analyse'],
  [/\bsynthesizer/i, 'synthesizer → synthesiser'],
  [/\bmodel(ing|ed)\b/i, 'modeling/modeled → modelling/modelled'],
  [/\blabel(ed|ing)\b/i, 'labeled → labelled'],
  [/\bneighbor/i, 'neighbor → neighbour'],
  [/\bfavorite/i, 'favorite → favourite'],
  [/\bflavor/i, 'flavor → flavour'],
  [/\b(organ|real|recogn|optim|summar|normal)iz/i, '-ize → -ise'],
  [/\bgray\b/i, 'gray → grey'],
  [/\bsound(s)? like it('|’)s gonna\b/i, 'informal wording'],
];

/** Heading → text of the blocks under it (until the next H2). */
function sectionsOf(blocks: Block[]): Map<string, Block[]> {
  const out = new Map<string, Block[]>();
  let cur: string | null = null;
  for (const b of blocks) {
    if (b.type === 'heading' && b.level === 2) {
      cur = b.text.replace(/’/g, "'");
      out.set(cur, []);
    } else if (cur) out.get(cur)!.push(b);
  }
  return out;
}

function checkTryThisValue(def: ParamDef, value: unknown): string | null {
  if (def.type === 'continuous') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${def.id} needs a number`;
    if (value < def.min || value > def.max) return `${def.id}=${value} is outside ${def.min}…${def.max}`;
    return null;
  }
  if (def.type === 'bool') return typeof value === 'boolean' ? null : `${def.id} needs true or false`;
  return def.options.some((o) => o.value === value) ? null : `${def.id}="${String(value)}" is not one of ${def.options.map((o) => o.value).join(', ')}`;
}

export function validateContent(input: ContentInput): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries = new Map<string, HelpEntry>();

  // glossary
  let glossary: Glossary = {};
  if (input.glossary === null) errors.push('glossary.yml is missing');
  else {
    const g = parseGlossary(input.glossary);
    if (g.ok) glossary = g.glossary;
    else errors.push(g.error);
  }
  for (const [key, g] of Object.entries(glossary)) {
    if (g.definition.length > 180) warnings.push(`glossary "${key}": definition is ${g.definition.length} characters; keep it to one line (≤ 180)`);
  }

  // entries
  const seen = new Set<string>();
  for (const f of input.files) {
    const dir = f.path.split('/')[0];
    const base = f.path.split('/').pop()!.replace(/\.md$/, '');
    if (dir !== 'sections' && dir !== 'controls') {
      errors.push(`${f.path}: Markdown files must live in sections/ or controls/`);
      continue;
    }
    const p = parseEntry(f.raw, f.path);
    if (!p.ok) {
      errors.push(p.error);
      continue;
    }
    const e = p.entry;
    if (e.id !== base) errors.push(`${f.path}: front-matter id "${e.id}" must match the file name "${base}"`);
    if (e.kind !== (dir === 'sections' ? 'section' : 'control')) errors.push(`${f.path}: kind "${e.kind}" does not match its folder (${dir})`);
    if (seen.has(e.id)) errors.push(`${f.path}: duplicate entry id "${e.id}"`);
    seen.add(e.id);
    entries.set(e.id, e);
  }

  // every registry id has an entry; no entries without a registry id
  for (const id of input.sectionHelpIds) if (!entries.has(id) || entries.get(id)!.kind !== 'section') errors.push(`missing section entry: content/help/sections/${id}.md`);
  for (const id of input.controlHelpIds) if (!entries.has(id) || entries.get(id)!.kind !== 'control') errors.push(`missing control entry: content/help/controls/${id}.md`);
  const known = new Set([...input.sectionHelpIds, ...input.controlHelpIds]);
  for (const e of entries.values()) if (!known.has(e.id)) errors.push(`${e.kind === 'section' ? 'sections' : 'controls'}/${e.id}.md: no control or section in the registry uses this help id (orphan)`);

  const params = new Map(input.params.map((p) => [p.id, p]));
  const presets = new Set(input.presetIds);
  const usedTerms = new Set<string>();

  for (const e of entries.values()) {
    const where = `${e.kind === 'section' ? 'sections' : 'controls'}/${e.id}.md`;

    for (const r of e.related) if (!entries.has(r)) errors.push(`${where}: related entry "${r}" does not exist`);
    for (const pr of e.presets) if (!presets.has(pr)) errors.push(`${where}: preset "${pr}" does not exist`);

    for (const link of collectLinks(e.blocks)) {
      const [scheme, target] = [link.href.split(':')[0], link.href.slice(link.href.indexOf(':') + 1)];
      if (scheme === 'help') {
        if (!entries.has(target)) errors.push(`${where}: link to missing entry "${target}" ("${link.text}")`);
      } else if (scheme === 'term') {
        usedTerms.add(target);
        if (!glossary[target]) errors.push(`${where}: link to unknown glossary term "${target}" ("${link.text}")`);
      } else errors.push(`${where}: only help: and term: links are allowed (found "${link.href}"); no external links`);
    }

    for (const b of e.blocks) {
      if (b.type === 'diagram' && !DIAGRAMS.has(b.name)) errors.push(`${where}: unknown diagram "${b.name}" (known: ${[...DIAGRAMS].join(', ')})`);
    }

    // "Try this" experiments must set real parameters to valid values
    e.tryThis.forEach((t, i) => {
      for (const [pid, value] of Object.entries(t.patch)) {
        const def = params.get(pid);
        if (!def) errors.push(`${where}: tryThis #${i + 1} sets unknown parameter "${pid}"`);
        else if (def.scope !== 'patch') errors.push(`${where}: tryThis #${i + 1} sets "${pid}", which is not part of a patch`);
        else {
          const problem = checkTryThisValue(def, value);
          if (problem) errors.push(`${where}: tryThis #${i + 1}: ${problem}`);
        }
      }
      if (Object.keys(t.patch).length === 0) errors.push(`${where}: tryThis #${i + 1} changes nothing`);
    });

    const prose = proseText(e.blocks);
    const words = wordCount(prose);
    if (words < 15) errors.push(`${where}: only ${words} words; write the entry`);

    if (e.kind === 'section') {
      const heads = e.blocks.filter((b): b is Extract<Block, { type: 'heading' }> => b.type === 'heading' && b.level === 2).map((b) => b.text.replace(/’/g, "'"));
      const missing = SECTION_HEADINGS.filter((h) => !heads.includes(h));
      if (missing.length) errors.push(`${where}: missing required heading(s): ${missing.map((m) => `"## ${m}"`).join(', ')}`);
      else if (heads.filter((h) => (SECTION_HEADINGS as readonly string[]).includes(h)).join('|') !== SECTION_HEADINGS.join('|')) errors.push(`${where}: headings must appear in this order: ${SECTION_HEADINGS.join(' → ')}`);

      const secs = sectionsOf(e.blocks);
      const beyond = [...(secs.get('Beyond this synth') ?? [])].map((b) => (b.type === 'paragraph' || b.type === 'quote' ? inlineText(b.children) : b.type === 'list' ? b.items.map(inlineText).join(' ') : '')).join(' ');
      for (const kw of REQUIRED_BEYOND[e.id] ?? []) if (!beyond.toLowerCase().includes(kw.toLowerCase())) errors.push(`${where}: "Beyond this synth" must mention "${kw}" (PRD §4.3)`);
      if (e.tryThis.length < 2 || e.tryThis.length > 3) warnings.push(`${where}: has ${e.tryThis.length} "Try this" experiments; the template asks for two or three`);
      const dr = words;
      if (dr < 150 || dr > 400) warnings.push(`${where}: ${dr} words (target 150–400)`);
    } else {
      const missing = CONTROL_LEADS.filter((l) => !e.body.includes(l));
      if (missing.length) errors.push(`${where}: control entries need paragraphs starting ${CONTROL_LEADS.join(' ')}; missing ${missing.join(' ')}`);
      if (e.blocks.some((b) => b.type === 'heading')) warnings.push(`${where}: control entries are short and should not have headings`);
      if (words < 30 || words > 80) warnings.push(`${where}: ${words} words (target 30–80)`);
    }

    for (const [re, hint] of AMERICAN) if (re.test(e.body) || re.test(e.title)) errors.push(`${where}: American spelling (${hint})`);

    if (words >= 40) {
      const grade = fleschKincaidGrade(prose);
      if (grade > 9) warnings.push(`${where}: reading level grade ${grade.toFixed(1)} (aim for ≤ 9)`);
    }
  }

  for (const key of Object.keys(glossary)) if (!usedTerms.has(key)) warnings.push(`glossary "${key}" is never linked from any entry`);

  return { errors, warnings, entries, glossary };
}

/** Diagram names the drawer can render (T4.5). Keep in step with ui/help/diagrams. */
export const DIAGRAMS: ReadonlySet<string> = new Set(['harmonics', 'adsr', 'lfo-target', 'beating', 'unison', 'filter-sweep']);
