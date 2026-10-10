import { SECTIONS } from '@/core/params/registry';
import type { SectionDef, SectionId } from '@/core/params/types';

/** Title + help id for a panel, straight from the registry so they cannot drift. */
export function sectionProps(id: SectionId): Pick<SectionDef, 'title' | 'helpId'> {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown section ${id}`);
  return { title: s.title, helpId: s.helpId };
}
