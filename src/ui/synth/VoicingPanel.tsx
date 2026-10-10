import { Section } from '../components';
import { Param } from './Param';
import { sectionProps } from './sections';

export function VoicingPanel() {
  return (
    <Section {...sectionProps('voicing')} className="voicing-panel">
      <div className="stack">
        <Param id="voice-mode" variant="segmented" />
        <div className="knob-row">
          <Param id="voice-count" />
          <Param id="voice-glide" />
          <Param id="master-tune" />
        </div>
      </div>
    </Section>
  );
}
