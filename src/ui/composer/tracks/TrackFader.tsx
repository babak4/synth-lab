import { useRef } from 'react';
import { formatValue } from '@/core/params/scale';
import type { ContinuousParamDef } from '@/core/params/types';
import { NumericReadout, type NumericReadoutHandle } from '../../components/NumericReadout';
import { sliderAttrs, sliderPosition, sliderValue } from '../../components/control-logic';

/** Track fader range (matches the project contract: -60 dB is silence, +6 dB the ceiling). */
export const TRACK_VOLUME_DEF: ContinuousParamDef = {
  type: 'continuous',
  id: 'track-volume',
  section: 'master',
  label: 'Track volume',
  shortLabel: 'Vol',
  helpId: 'master',
  scope: 'global',
  stage: 'master',
  smoothingMs: 0,
  min: -60,
  max: 6,
  default: 0,
  scale: 'linear',
  unit: 'dB',
  step: 0,
};

interface Props {
  trackName: string;
  value: number;
  onChange: (db: number) => void;
}

/**
 * The shared slider kit (native range input over normalised position, numeric readout, double-click
 * resets), keyed to a track rather than a registry parameter: a fader belongs to the project, not the patch.
 */
export function TrackFader({ trackName, value, onChange }: Props) {
  const def = TRACK_VOLUME_DEF;
  const { max, step } = sliderAttrs(def);
  const readout = useRef<NumericReadoutHandle>(null);
  const label = `Volume, ${trackName}`;
  const roDef = { ...def, label };
  return (
    <div className="track-fader control slider horizontal">
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={sliderPosition(def, value)}
        aria-label={label}
        aria-valuetext={formatValue(def, value)}
        onChange={(e) => onChange(sliderValue(def, Number(e.target.value)))}
        onDoubleClick={() => onChange(def.default)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            readout.current?.edit();
          }
        }}
      />
      <NumericReadout ref={readout} def={roDef} value={value} onChange={onChange} />
    </div>
  );
}
