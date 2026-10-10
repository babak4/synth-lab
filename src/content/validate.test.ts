import { describe, expect, it } from 'vitest';
import { GLOSSARY, controlStub, sectionStub, stubContent, withFile, withoutFile } from './test-fixtures';
import { validateContent } from './validate';

const errorsFor = (input: ReturnType<typeof stubContent>) => validateContent(input).errors;
const has = (errs: string[], text: string | RegExp) => errs.some((e) => (typeof text === 'string' ? e.includes(text) : text.test(e)));

describe('validateContent: stub content for every help id', () => {
  it('passes with no errors', () => {
    const r = validateContent(stubContent());
    expect(r.errors).toEqual([]);
    expect(r.entries.size).toBe(stubContent().files.length);
  });
});

describe('validateContent: coverage', () => {
  it('fails when a control has no help entry, naming the file to write', () => {
    const e = errorsFor(withoutFile(stubContent(), 'controls/filter-cutoff.md'));
    expect(e).toContain('missing control entry: content/help/controls/filter-cutoff.md');
  });
  it('fails when a section has no entry', () => {
    expect(has(errorsFor(withoutFile(stubContent(), 'sections/filter.md')), 'missing section entry: content/help/sections/filter.md')).toBe(true);
  });
  it('fails on an orphan entry no registry control uses', () => {
    const e = errorsFor(withFile(stubContent(), controlStub('not-a-control')));
    expect(has(e, 'controls/not-a-control.md: no control or section in the registry uses this help id')).toBe(true);
  });
  it('fails when a file is in the wrong place', () => {
    const e = errorsFor(withFile(stubContent(), { path: 'misc/x.md', raw: '---\nid: x\n---\n' }));
    expect(has(e, 'must live in sections/ or controls/')).toBe(true);
  });
});

describe('validateContent: front-matter', () => {
  it('reports a missing or malformed block clearly', () => {
    expect(has(errorsFor(withFile(stubContent(), { path: 'controls/filter-cutoff.md', raw: 'no front matter' })), 'controls/filter-cutoff.md: missing front-matter')).toBe(true);
    expect(has(errorsFor(withFile(stubContent(), { path: 'controls/filter-cutoff.md', raw: '---\nid: [oops\n---\nbody' })), 'not valid YAML')).toBe(true);
    expect(has(errorsFor(withFile(stubContent(), controlStub('filter-cutoff', { frontMatter: 'id: filter-cutoff\nkind: control' }))), 'invalid front-matter (title')).toBe(true);
    expect(has(errorsFor(withFile(stubContent(), controlStub('filter-cutoff', { frontMatter: 'id: filter-cutoff\ntitle: x\nkind: gadget' }))), 'invalid front-matter (kind')).toBe(true);
  });
  it('requires the id to match the file name and the kind to match the folder', () => {
    expect(has(errorsFor(withFile(stubContent(), controlStub('filter-cutoff', { frontMatter: 'id: filter-resonance\ntitle: x\nkind: control' }))), 'must match the file name')).toBe(true);
    expect(has(errorsFor(withFile(stubContent(), controlStub('filter-cutoff', { frontMatter: 'id: filter-cutoff\ntitle: x\nkind: section' }))), 'does not match its folder')).toBe(true);
  });
});

describe('validateContent: links', () => {
  const withBody = (id: string, body: string, fm = '') => withFile(stubContent(), controlStub(id, { body: `**What it does.** ${body}\n\n**Range.** Wide.\n\n**Tip.** Try it.`, frontMatter: `id: ${id}\ntitle: x\nkind: control\n${fm}` }));
  it('catches a related id that does not exist', () => {
    expect(has(errorsFor(withBody('filter-cutoff', 'text', 'related: [ghost]')), 'related entry "ghost" does not exist')).toBe(true);
  });
  it('catches a body link to a missing entry and a missing glossary term', () => {
    expect(has(errorsFor(withBody('filter-cutoff', 'See [x](help:ghost).')), 'link to missing entry "ghost"')).toBe(true);
    expect(has(errorsFor(withBody('filter-cutoff', 'A [thing](term:nonsense).')), 'unknown glossary term "nonsense"')).toBe(true);
  });
  it('accepts links that resolve', () => {
    expect(errorsFor(withBody('filter-cutoff', 'See [res](help:filter-resonance) for the boost at the cutoff, and a [harmonic](term:harmonic) for the pieces of the sound that it removes first.'))).toEqual([]);
  });
  it('refuses external links (no third-party content)', () => {
    expect(has(errorsFor(withBody('filter-cutoff', 'Visit [site](https://example.com).')), 'no external links')).toBe(true);
  });
  it('catches a preset that does not exist', () => {
    expect(has(errorsFor(withBody('filter-cutoff', 'text', 'presets: [no-such-preset]')), 'preset "no-such-preset" does not exist')).toBe(true);
  });
  it('catches an unknown diagram', () => {
    expect(has(errorsFor(withFile(stubContent(), sectionStub('filter', { extraBody: '::diagram{name="nope"}' }))), 'unknown diagram "nope"')).toBe(true);
    expect(errorsFor(withFile(stubContent(), sectionStub('filter', { extraBody: '::diagram{name="harmonics"}' })))).toEqual([]);
  });
});

describe('validateContent: section template (PRD §4.2)', () => {
  it('requires every heading, naming the missing one', () => {
    for (const h of ['What it is', 'Beyond this synth', "Where you've heard it"]) {
      expect(has(errorsFor(withFile(stubContent(), sectionStub('filter', { skipHeading: h }))), `"## ${h}"`), h).toBe(true);
    }
  });
  it('requires "Beyond this synth" to cover the PRD §4.3 minimum for that section', () => {
    const e = errorsFor(withFile(stubContent(), sectionStub('filter', { beyond: 'Some filters are fancier.' })));
    expect(has(e, '"Beyond this synth" must mention "Moog"')).toBe(true);
    expect(has(e, 'must mention "24 dB"')).toBe(true);
  });
  it('matches keywords case-insensitively', () => {
    const ok = errorsFor(withFile(stubContent(), sectionStub('filter', { beyond: 'MOOG ladder, 24 DB slopes, State-Variable designs, self-oscillation.' })));
    expect(ok).toEqual([]);
  });
});

describe('validateContent: control template', () => {
  it('requires the three lead-ins', () => {
    const e = errorsFor(withFile(stubContent(), controlStub('filter-cutoff', { body: '**What it does.** Something.\n\n**Tip.** Try.' })));
    expect(has(e, 'missing **Range.**')).toBe(true);
  });
});

describe('validateContent: "Try this" experiments', () => {
  const tryWith = (patch: string) =>
    withFile(stubContent(), sectionStub('filter', { frontMatter: `id: filter\ntitle: Filter\nkind: section\ntryThis:\n  - title: T\n    description: D\n    patch: ${patch}` }));
  it('accepts valid parameter changes', () => {
    expect(errorsFor(tryWith('{ filter-cutoff: 300, filter-type: bandpass, lfo-sync: true }'))).toEqual([]);
  });
  it('rejects unknown parameters, out-of-range numbers, bad options and wrong types', () => {
    expect(has(errorsFor(tryWith('{ bogus: 1 }')), 'unknown parameter "bogus"')).toBe(true);
    expect(has(errorsFor(tryWith('{ filter-cutoff: 5 }')), 'filter-cutoff=5 is outside 20…20000')).toBe(true);
    expect(has(errorsFor(tryWith('{ filter-type: comb }')), 'filter-type="comb" is not one of lowpass, highpass, bandpass, notch')).toBe(true);
    expect(has(errorsFor(tryWith('{ lfo-sync: yes please }')), 'lfo-sync needs true or false')).toBe(true);
    expect(has(errorsFor(tryWith('{ filter-cutoff: loud }')), 'filter-cutoff needs a number')).toBe(true);
  });
  it('rejects settings that are not part of a patch, and empty experiments', () => {
    expect(has(errorsFor(tryWith('{ master-volume: -6 }')), '"master-volume", which is not part of a patch')).toBe(true);
    expect(has(errorsFor(tryWith('{}')), 'changes nothing')).toBe(true);
  });
});

describe('validateContent: writing standards', () => {
  it('rejects American spellings, naming the British form', () => {
    const e = errorsFor(withFile(stubContent(), controlStub('filter-cutoff', { body: '**What it does.** Changes the color and behavior of the synthesizer.\n\n**Range.** Wide.\n\n**Tip.** Analyze it.' })));
    for (const hint of ['color → colour', 'behavior → behaviour', 'synthesizer → synthesiser', 'analyze → analyse']) expect(has(e, hint), hint).toBe(true);
  });
  it('accepts British spellings', () => {
    expect(errorsFor(withFile(stubContent(), controlStub('filter-cutoff', { body: '**What it does.** Changes the colour and behaviour of the synthesiser.\n\n**Range.** Wide.\n\n**Tip.** Analyse it.' })))).toEqual([]);
  });
  it('requires a glossary, and flags an empty entry', () => {
    expect(errorsFor({ ...stubContent(), glossary: null })).toContain('glossary.yml is missing');
    expect(has(errorsFor(withFile(stubContent(), controlStub('filter-cutoff', { body: '**What it does.**' }))), 'write the entry')).toBe(true);
  });
});

describe('validateContent: warnings do not fail the build', () => {
  it('warns about length, reading level and unused glossary terms', () => {
    const dense = '**What it does.** Notwithstanding considerable disagreement regarding electromagnetic interference, characteristically sophisticated instrumentation necessitates comprehensive calibration procedures across heterogeneous configurations, notwithstanding unprecedented technological complexity.\n\n**Range.** Characteristically unpredictable, notwithstanding considerable experimental investigation.\n\n**Tip.** Systematically experiment with extraordinarily comprehensive instrumentation, notwithstanding considerable organisational difficulties.';
    const r = validateContent(withFile({ ...stubContent(), glossary: GLOSSARY + 'unused:\n  term: Unused\n  definition: Never linked.\n' }, controlStub('filter-cutoff', { body: dense })));
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('reading level'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('glossary "unused" is never linked'))).toBe(true);
  });

  it('warns, without failing, when a control entry is outside the 30–80 word target', () => {
    const short = '**What it does.** Moves the sound about a bit.\n\n**Range.** Low to high.\n\n**Tip.** Play with it.';
    const r = validateContent(withFile(stubContent(), controlStub('filter-cutoff', { body: short })));
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('controls/filter-cutoff.md') && w.includes('words (target 30–80)'))).toBe(true);
  });
});
