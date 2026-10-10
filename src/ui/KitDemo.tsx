import { useState } from 'react';
import { HelpContext } from './help/help-context';
import { Knob, ParamControl, Section, Segmented, Select, Slider, Toggle } from './components';

/** Storybook-style demo of the component kit, shown at `#kit`. */
export function KitDemo() {
  const [cutoff, setCutoff] = useState(8000);
  const [res, setRes] = useState(1);
  const [wave, setWave] = useState('sawtooth');
  const [type, setType] = useState('lowpass');
  const [sync, setSync] = useState(false);
  const [attack, setAttack] = useState(0.005);
  const [oct, setOct] = useState(0);
  const [glide, setGlide] = useState(0);
  const [lastHelp, setLastHelp] = useState('—');
  const [dark, setDark] = useState<boolean | null>(null);

  return (
    <HelpContext.Provider value={{ open: setLastHelp, close: () => {} }}>
      <main style={{ padding: 16, display: 'grid', gap: 12, maxWidth: 900 }}>
        <h1>Component kit</h1>
        <p>
          Last help opened: <code data-testid="last-help">{lastHelp}</code>{' '}
          <button
            type="button"
            onClick={() => {
              const next = !(dark ?? matchMedia('(prefers-color-scheme: dark)').matches);
              setDark(next);
              document.documentElement.dataset.theme = next ? 'dark' : 'light';
            }}
          >
            Toggle theme
          </button>
        </p>
        <Section title="Filter" helpId="filter" more={<Slider id="filter-key-tracking" value={0} onChange={() => {}} />}>
          <Segmented id="filter-type" value={type} onChange={setType} />
          <Knob id="filter-cutoff" value={cutoff} onChange={setCutoff} />
          <Knob id="filter-resonance" value={res} onChange={setRes} />
        </Section>
        <Section title="Oscillators" helpId="oscillators">
          <Segmented id="osc-a-waveform" value={wave} onChange={setWave} icons />
          <Knob id="osc-a-octave" value={oct} onChange={setOct} />
          <Slider id="amp-env-attack" value={attack} onChange={setAttack} />
          <Knob id="voice-glide" value={glide} onChange={setGlide} />
        </Section>
        <Section title="LFO" helpId="lfo">
          <Toggle id="lfo-sync" value={sync} onChange={setSync} />
          <Select id="lfo-destination" value="cutoff" onChange={() => {}} />
          <ParamControl id="lfo-shape" value="sine" onChange={() => {}} icons />
        </Section>
      </main>
    </HelpContext.Provider>
  );
}
