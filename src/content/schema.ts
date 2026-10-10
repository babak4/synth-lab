import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { parseMarkdown, type Block } from './markdown';

/** A value a "Try this" experiment sets on the patch. Validated against the registry by the checker. */
const ParamValue = z.union([z.number(), z.string(), z.boolean()]);

export const TryThisSchema = z.object({
  title: z.string().min(1),
  /** One or two sentences: what to do and what to listen for. */
  description: z.string().min(1),
  /** Parameters to change, by registry id. Everything else is left as the learner has it. */
  patch: z.record(z.string(), ParamValue),
  /** MIDI note to play so the effect can be heard straight away. */
  note: z.number().int().min(0).max(127).optional(),
});
export type TryThis = z.infer<typeof TryThisSchema>;

export const FrontMatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id must be lower-case letters, digits and hyphens'),
  title: z.string().min(1),
  kind: z.enum(['section', 'control']),
  related: z.array(z.string()).default([]),
  presets: z.array(z.string()).default([]),
  tryThis: z.array(TryThisSchema).default([]),
});
export type FrontMatter = z.infer<typeof FrontMatterSchema>;

export interface HelpEntry extends FrontMatter {
  /** Source Markdown (without front-matter). */
  body: string;
  blocks: Block[];
}

export type ParsedEntry = { ok: true; entry: HelpEntry } | { ok: false; error: string };

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Split a file into validated front-matter and a parsed body. `source` names the file in errors. */
export function parseEntry(raw: string, source: string): ParsedEntry {
  const m = FRONT.exec(raw);
  if (!m) return { ok: false, error: `${source}: missing front-matter (--- … ---)` };
  let data: unknown;
  try {
    data = parseYaml(m[1]!);
  } catch (e) {
    return { ok: false, error: `${source}: front-matter is not valid YAML (${(e as Error).message.split('\n')[0]})` };
  }
  const fm = FrontMatterSchema.safeParse(data);
  if (!fm.success) {
    const why = fm.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return { ok: false, error: `${source}: invalid front-matter (${why})` };
  }
  const body = m[2]!.trim();
  return { ok: true, entry: { ...fm.data, body, blocks: parseMarkdown(body) } };
}

// ── glossary ────────────────────────────────────────────────────────────────────────────────

export const GlossarySchema = z.record(z.string().regex(/^[a-z0-9-]+$/), z.object({ term: z.string().min(1), definition: z.string().min(1) }));
export type Glossary = z.infer<typeof GlossarySchema>;

export function parseGlossary(raw: string): { ok: true; glossary: Glossary } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = parseYaml(raw);
  } catch (e) {
    return { ok: false, error: `glossary.yml is not valid YAML (${(e as Error).message.split('\n')[0]})` };
  }
  const g = GlossarySchema.safeParse(data);
  return g.success ? { ok: true, glossary: g.data } : { ok: false, error: `glossary.yml: ${g.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
}
