/**
 * Help-content check (plan T4.2): fails the build if any control or section lacks a help entry, any
 * link or related id dangles, a section entry lacks the required template headings (including
 * "Beyond this synth"), a "Try this" sets an invalid parameter, or the writing breaks the style rules.
 *
 *   npm run content
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent, type ContentFile } from '../src/content/validate';
import { CONTROL_HELP_IDS, PARAM_DEFS, SECTION_HELP_IDS } from '../src/core/params/registry';
import { FACTORY_PRESETS } from '../src/presets';

const ROOT = resolve(fileURLToPath(new URL('../content/help', import.meta.url)));

function readFiles(): { files: ContentFile[]; glossary: string | null } {
  const files: ContentFile[] = [];
  for (const dir of ['sections', 'controls']) {
    const full = join(ROOT, dir);
    if (!existsSync(full)) continue;
    for (const name of readdirSync(full).sort()) {
      if (name.endsWith('.md')) files.push({ path: `${dir}/${name}`, raw: readFileSync(join(full, name), 'utf8') });
      else if (!name.startsWith('.')) files.push({ path: `${dir}/${name}`, raw: '' }); // flagged by the validator
    }
  }
  const g = join(ROOT, 'glossary.yml');
  return { files, glossary: existsSync(g) ? readFileSync(g, 'utf8') : null };
}

const { files, glossary } = readFiles();
const report = validateContent({
  files: files.filter((f) => f.path.endsWith('.md')),
  glossary,
  controlHelpIds: CONTROL_HELP_IDS,
  sectionHelpIds: SECTION_HELP_IDS,
  params: PARAM_DEFS,
  presetIds: FACTORY_PRESETS.map((p) => p.id),
});

const strays = files.filter((f) => !f.path.endsWith('.md')).map((f) => `${f.path}: only .md files belong here`);
const errors = [...report.errors, ...strays];

for (const w of report.warnings) console.warn(`warning  ${w}`);
for (const e of errors) console.error(`error    ${e}`);

const sections = [...report.entries.values()].filter((e) => e.kind === 'section').length;
const controls = report.entries.size - sections;
console.log(`\nhelp content: ${sections} section and ${controls} control entries, ${Object.keys(report.glossary).length} glossary terms, ${report.warnings.length} warning(s), ${errors.length} error(s)`);
if (errors.length > 0) {
  console.error(`\n${errors.length} content error(s). The build needs an entry for every control and section; see content/help/.`);
  process.exit(1);
}
