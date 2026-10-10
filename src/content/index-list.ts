/** The Help index (PRD §4.1): every entry in signal-flow order, so the help also reads as a course outline. */
import { PARAM_DEFS, SECTIONS, SECTION_HELP_IDS } from '@/core/params/registry';

export interface IndexGroup {
  /** Section entry id. */
  id: string;
  controls: { id: string; label: string }[];
}

export function buildIndex(): IndexGroup[] {
  return SECTION_HELP_IDS.map((id) => {
    const sectionIds = SECTIONS.filter((s) => s.helpId === id).map((s) => s.id);
    const controls = PARAM_DEFS.filter((d) => sectionIds.includes(d.section)).map((d) => ({ id: d.helpId, label: d.label }));
    return { id, controls };
  });
}
