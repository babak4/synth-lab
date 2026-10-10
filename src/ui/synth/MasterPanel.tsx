import { Section } from '../components';
import { Meter } from '../visualisers/Meter';
import { Scope } from '../visualisers/Scope';
import { Spectrum } from '../visualisers/Spectrum';
import { sectionProps } from './sections';

/** Output section: volume lives in the top bar; here you see and hear what the synth is doing. */
export function MasterPanel() {
  return (
    <Section {...sectionProps('master')} className="master-panel">
      <div className="visualisers">
        <Scope />
        <Spectrum />
        <Meter />
      </div>
    </Section>
  );
}
