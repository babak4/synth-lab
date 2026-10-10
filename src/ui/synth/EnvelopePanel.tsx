import { Section } from '../components';
import { EnvelopePlot } from '../visualisers/Plots';
import { Param } from './Param';
import { sectionProps } from './sections';

export function AmpEnvelopePanel() {
  return (
    <Section {...sectionProps('ampEnv')} className="env-panel">
      <div className="stack">
        <EnvelopePlot which="amp" />
        <div className="knob-row">
          <Param id="amp-env-attack" />
          <Param id="amp-env-decay" />
          <Param id="amp-env-sustain" />
          <Param id="amp-env-release" />
          <Param id="amp-env-velocity" />
        </div>
      </div>
    </Section>
  );
}

export function FilterEnvelopePanel() {
  return (
    <Section {...sectionProps('filterEnv')} className="env-panel">
      <div className="stack">
        <EnvelopePlot which="filter" />
        <div className="knob-row">
          <Param id="filter-env-attack" />
          <Param id="filter-env-decay" />
          <Param id="filter-env-sustain" />
          <Param id="filter-env-release" />
          <Param id="filter-env-velocity" />
        </div>
      </div>
    </Section>
  );
}
