import { describe, expect, it } from 'vitest';
import { CONTROL_HELP_IDS, SECTION_HELP_IDS } from '@/core/params/registry';
import { buildIndex } from './index-list';

describe('help index', () => {
  const idx = buildIndex();
  it('lists the sections in signal-flow order', () => {
    expect(idx.map((g) => g.id)).toEqual([...SECTION_HELP_IDS]);
    expect(idx.map((g) => g.id).slice(0, 4)).toEqual(['oscillators', 'mixer', 'filter', 'envelopes']);
  });
  it('lists every control exactly once, under its own section', () => {
    const all = idx.flatMap((g) => g.controls.map((c) => c.id));
    expect(all.sort()).toEqual([...CONTROL_HELP_IDS].sort());
    expect(idx.find((g) => g.id === 'envelopes')!.controls.length).toBe(10);
    expect(idx.find((g) => g.id === 'effects')!.controls.length).toBe(14);
    expect(idx.find((g) => g.id === 'oscillators')!.controls.map((c) => c.id)).toContain('sub-octave');
  });
});
