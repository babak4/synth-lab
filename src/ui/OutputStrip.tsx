import { Section } from './components';
import { Meter } from './visualisers/Meter';
import { Scope } from './visualisers/Scope';
import { Spectrum } from './visualisers/Spectrum';
import { sectionProps } from './synth/sections';

/** Scope, spectrum and level meter: pinned with the keyboard so they are visible on every tab (PRD §2). */
export function OutputStrip() {
  return (
    <Section {...sectionProps('master')} className="master-panel output-strip">
      <div className="visualisers">
        <Scope />
        <Spectrum />
        <Meter />
      </div>
    </Section>
  );
}
