import { usePatchParam } from '@/app/context';
import { Section } from '../components';
import { Param } from './Param';
import { sectionProps } from './sections';

export function DistortionPanel() {
  return (
    <Section {...sectionProps('distortion')} className="fx-panel">
      <div className="stack">
        <Param id="dist-on" />
        <div className="knob-row">
          <Param id="dist-drive" />
          <Param id="dist-tone" />
          <Param id="dist-mix" />
        </div>
      </div>
    </Section>
  );
}

export function DelayPanel() {
  const [sync] = usePatchParam('delay-sync');
  return (
    <Section {...sectionProps('delay')} className="fx-panel">
      <div className="stack">
        <div className="row">
          <Param id="delay-on" />
          <Param id="delay-sync" />
          <Param id="delay-pingpong" />
        </div>
        <div className="knob-row">
          {sync ? <Param id="delay-division" variant="select" /> : <Param id="delay-time" />}
          <Param id="delay-feedback" />
          <Param id="delay-mix" />
        </div>
      </div>
    </Section>
  );
}

export function ReverbPanel() {
  return (
    <Section {...sectionProps('reverb')} className="fx-panel">
      <div className="stack">
        <Param id="reverb-on" />
        <Param id="reverb-size" variant="segmented" />
        <div className="knob-row">
          <Param id="reverb-mix" />
        </div>
      </div>
    </Section>
  );
}
