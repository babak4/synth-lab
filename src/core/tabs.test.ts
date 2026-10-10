import { describe, expect, it } from 'vitest';
import { SECTIONS } from './params/registry';
import { TABS, tabForHelpId } from './tabs';

describe('tab grouping', () => {
  it('puts every synth section on exactly one tab; master and keyboard are pinned, on none', () => {
    const placed = TABS.flatMap((t) => t.sections);
    expect(new Set(placed).size).toBe(placed.length);
    const unplaced = SECTIONS.map((s) => s.id).filter((id) => !placed.includes(id));
    expect(unplaced.sort()).toEqual(['keyboard', 'master']);
  });

  it('finds the tab for section and control help ids', () => {
    expect(tabForHelpId('filter')).toBe('shape');
    expect(tabForHelpId('filter-cutoff')).toBe('shape');
    expect(tabForHelpId('envelopes')).toBe('shape');
    expect(tabForHelpId('lfo-rate')).toBe('modulation');
    expect(tabForHelpId('effects')).toBe('effects');
    expect(tabForHelpId('composition')).toBe('composition');
    expect(tabForHelpId('oscillators')).toBe('sound');
  });

  it('has no tab for pinned or unknown entries', () => {
    expect(tabForHelpId('master')).toBeNull();
    expect(tabForHelpId('keyboard')).toBeNull();
    expect(tabForHelpId('index')).toBeNull();
    expect(tabForHelpId('nonsense')).toBeNull();
  });
});
