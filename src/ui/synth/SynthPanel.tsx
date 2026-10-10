import { AmpEnvelopePanel, FilterEnvelopePanel } from './EnvelopePanel';
import { DelayPanel, DistortionPanel, ReverbPanel } from './EffectsPanel';
import { FilterPanel } from './FilterPanel';
import { LfoPanel } from './LfoPanel';
import { MasterPanel } from './MasterPanel';
import { MixerPanel } from './MixerPanel';
import { OscillatorsPanel } from './OscillatorsPanel';
import { VoicingPanel } from './VoicingPanel';

/** A thin line with an arrowhead: the signal (solid) or a modulation route (dashed). */
export function Connector({ kind = 'signal' }: { kind?: 'signal' | 'mod' }) {
  return <span className={`connector ${kind}`} aria-hidden="true" />;
}

/**
 * Sections in signal-flow order, with connector lines between them, so the layout itself teaches the
 * architecture (PRD §2): sources → mixer → filter → amp, modulation below, then effects → master.
 */
export function SynthPanel() {
  return (
    <div className="synth-panel" data-testid="synth-panel">
      {/* Sound sources and their mix */}
      <div className="flow">
        <OscillatorsPanel />
        <Connector />
        <MixerPanel />
      </div>
      {/* Shaping: the filter (moved by its envelope, dashed) and then the amp with its envelope */}
      <div className="flow">
        <FilterEnvelopePanel />
        <Connector kind="mod" />
        <FilterPanel />
        <Connector />
        <AmpEnvelopePanel />
      </div>
      {/* How notes become voices, and the slow modulation that moves things over time */}
      <div className="flow">
        <VoicingPanel />
        <Connector kind="mod" />
        <LfoPanel />
      </div>
      {/* Effects in their fixed order */}
      <div className="flow">
        <DistortionPanel />
        <Connector />
        <DelayPanel />
        <Connector />
        <ReverbPanel />
      </div>
      {/* Output: scope, spectrum, meter */}
      <div className="flow">
        <MasterPanel />
      </div>
    </div>
  );
}
