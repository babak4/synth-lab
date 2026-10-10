import { usePatchParam } from '@/app/context';
import { Section } from '../components';
import { Param } from './Param';
import { sectionProps } from './sections';

function Oscillator({ which }: { which: 'a' | 'b' }) {
  const [wave] = usePatchParam(`osc-${which}-waveform`);
  return (
    <div className="osc" data-osc={which} role="group" aria-label={`Oscillator ${which.toUpperCase()}`}>
      <h3 className="osc-title" aria-hidden="true">{which.toUpperCase()}</h3>
      <Param id={`osc-${which}-waveform`} icons variant="segmented" />
      <div className="knob-row">
        <Param id={`osc-${which}-octave`} />
        <Param id={`osc-${which}-semitone`} />
        <Param id={`osc-${which}-fine`} />
        {/* Pulse width only means something for a pulse wave; 50% is a square. */}
        <Param id={`osc-${which}-pulse-width`} disabled={wave !== 'pulse'} />
      </div>
    </div>
  );
}

export function OscillatorsPanel() {
  return (
    <Section {...sectionProps('oscillators')} className="osc-panel">
      <Oscillator which="a" />
      <Oscillator which="b" />
      <div className="osc sub" role="group" aria-label="Sub oscillator">
        <h3 className="osc-title" aria-hidden="true">Sub</h3>
        <Param id="sub-waveform" icons variant="segmented" />
        <div className="knob-row">
          <Param id="sub-octave" />
        </div>
      </div>
    </Section>
  );
}
