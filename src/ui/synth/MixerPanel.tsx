import { Section, Slider } from '../components';
import { usePatchParam } from '@/app/context';
import { sectionProps } from './sections';

function Level({ id }: { id: 'mix-osc-a' | 'mix-osc-b' | 'mix-sub' | 'mix-noise' }) {
  const [v, set] = usePatchParam(id);
  return <Slider id={id} value={v} onChange={set} orientation="vertical" />;
}

export function MixerPanel() {
  return (
    <Section {...sectionProps('mixer')} className="mixer-panel">
      <Level id="mix-osc-a" />
      <Level id="mix-osc-b" />
      <Level id="mix-sub" />
      <Level id="mix-noise" />
    </Section>
  );
}
