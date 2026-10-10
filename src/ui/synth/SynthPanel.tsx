import { AmpEnvelopePanel, FilterEnvelopePanel } from './EnvelopePanel';
import { DelayPanel, DistortionPanel, ReverbPanel } from './EffectsPanel';
import { FilterPanel } from './FilterPanel';
import { LfoPanel } from './LfoPanel';
import { MixerPanel } from './MixerPanel';
import { OscillatorsPanel } from './OscillatorsPanel';
import type { TabId } from '@/core/tabs';
import { VoicingPanel } from './VoicingPanel';

/** A thin line with an arrowhead: the signal (solid) or a modulation route (dashed). */
export function Connector({ kind = 'signal' }: { kind?: 'signal' | 'mod' }) {
  return <span className={`connector ${kind}`} aria-hidden="true" />;
}

/**
 * Sections in signal-flow order, with connector lines between them, so the layout itself teaches the
 * architecture (PRD §2): sources → mixer → filter → amp, modulation below, then effects. The output
 * (scope, spectrum, meter) is pinned beside the keyboard, so it is not part of any tab (plan T2.7).
 * Without `tab` every group is shown (tests and the kit); with it, only that tab's.
 */
export function SynthPanel({ tab }: { tab?: TabId }) {
  const show = (t: TabId) => tab === undefined || tab === t;
  return (
    <div className="synth-panel" data-testid="synth-panel">
      {show('sound') && (
        <div className="flow">
          <OscillatorsPanel />
          <Connector />
          <MixerPanel />
        </div>
      )}
      {show('shape') && (
        <div className="flow">
          <FilterEnvelopePanel />
          <Connector kind="mod" />
          <FilterPanel />
          <Connector />
          <AmpEnvelopePanel />
        </div>
      )}
      {show('modulation') && (
        <div className="flow">
          <VoicingPanel />
          <Connector kind="mod" />
          <LfoPanel />
        </div>
      )}
      {show('effects') && (
        <div className="flow">
          <DistortionPanel />
          <Connector />
          <DelayPanel />
          <Connector />
          <ReverbPanel />
        </div>
      )}
    </div>
  );
}
