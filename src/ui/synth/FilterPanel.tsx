import { Section } from '../components';
import { FilterResponsePlot } from '../visualisers/Plots';
import { Param } from './Param';
import { sectionProps } from './sections';

export function FilterPanel() {
  return (
    <Section {...sectionProps('filter')} className="filter-panel">
      <div className="stack">
        <FilterResponsePlot />
        <Param id="filter-type" variant="segmented" />
        <div className="knob-row">
          <Param id="filter-cutoff" />
          <Param id="filter-resonance" />
          <Param id="filter-env-amount" />
          <Param id="filter-key-tracking" />
        </div>
      </div>
    </Section>
  );
}
