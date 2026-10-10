/**
 * Tab grouping for the fixed-viewport layout (plan T2.7). Pure data + lookups: each tab is a list of
 * registry sections, so changing the grouping is a one-line edit here.
 */
import { PARAM_DEFS, SECTIONS } from './params/registry';
import type { SectionId } from './params/types';

export type TabId = 'sound' | 'shape' | 'modulation' | 'effects' | 'composition';

export interface TabDef {
  readonly id: TabId;
  readonly label: string;
  readonly sections: readonly SectionId[];
}

export const TABS: readonly TabDef[] = [
  { id: 'sound', label: 'Sound', sections: ['oscillators', 'mixer'] },
  { id: 'shape', label: 'Shape', sections: ['filterEnv', 'filter', 'ampEnv'] },
  { id: 'modulation', label: 'Modulation', sections: ['voicing', 'lfo'] },
  { id: 'effects', label: 'Effects', sections: ['distortion', 'delay', 'reverb'] },
  { id: 'composition', label: 'Composition', sections: [] },
];

export const DEFAULT_TAB: TabId = 'sound';

export const isTabId = (v: unknown): v is TabId => TABS.some((t) => t.id === v);

/** The tab that shows the control or section a help entry describes; null for pinned or unknown ones. */
export function tabForHelpId(helpId: string): TabId | null {
  if (helpId === 'composition') return 'composition';
  const section = PARAM_DEFS.find((d) => d.helpId === helpId)?.section ?? SECTIONS.find((s) => s.helpId === helpId)?.id;
  if (!section) return null;
  return TABS.find((t) => t.sections.includes(section))?.id ?? null;
}
