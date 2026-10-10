import { usePatchParam } from '@/app/context';
import { Section } from '../components';
import { LfoPlot } from '../visualisers/Plots';
import { Param } from './Param';
import { sectionProps } from './sections';

export function LfoPanel() {
  const [sync] = usePatchParam('lfo-sync');
  return (
    <Section {...sectionProps('lfo')} className="lfo-panel">
      <div className="stack">
        <LfoPlot />
        <Param id="lfo-shape" icons />
        <div className="knob-row">
          {/* Free rate in Hz, or a note division when synced to the project tempo. */}
          {sync ? <Param id="lfo-division" variant="select" /> : <Param id="lfo-rate" />}
          <Param id="lfo-depth" />
        </div>
        <div className="row">
          <Param id="lfo-sync" />
          <Param id="lfo-retrigger" />
        </div>
      </div>
      <Param id="lfo-destination" variant="segmented" />
    </Section>
  );
}
