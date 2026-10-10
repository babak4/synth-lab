import { getParamDef } from '@/core/params/registry';
import { formatValue } from '@/core/params/scale';
import type { ContinuousParamDef } from '@/core/params/types';
import { HelpButton } from './HelpButton';
import { useRef } from 'react';
import { NumericReadout, type NumericReadoutHandle } from './NumericReadout';
import { sliderAttrs, sliderPosition, sliderValue } from './control-logic';
import type { ContinuousId } from './types';

interface Props {
  id: ContinuousId;
  value: number;
  onChange: (value: number) => void;
  orientation?: 'horizontal' | 'vertical';
  noHelp?: boolean;
  disabled?: boolean;
}

/** Native range input over normalised position: keyboard and screen-reader behaviour come for free. */
export function Slider({ id, value, onChange, orientation = 'horizontal', noHelp, disabled }: Props) {
  const def = getParamDef(id) as ContinuousParamDef;
  const { max, step } = sliderAttrs(def);
  const readout = useRef<NumericReadoutHandle>(null);
  const text = formatValue(def, value);
  return (
    <div className={`control slider ${orientation}`} data-help-for={def.helpId} data-param={id}>
      <div className="control-label">
        <label htmlFor={`${id}-input`}>{def.shortLabel ?? def.label}</label>
        {!noHelp && <HelpButton helpId={def.helpId} label={def.label} />}
      </div>
      <input
        id={`${id}-input`}
        type="range"
        min={0}
        max={max}
        step={step}
        value={sliderPosition(def, value)}
        aria-label={def.label}
        aria-valuetext={text}
        aria-orientation={orientation}
        disabled={disabled}
        onChange={(e) => onChange(sliderValue(def, Number(e.target.value)))}
        onDoubleClick={() => onChange(def.default)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !disabled) {
            e.preventDefault();
            readout.current?.edit();
          }
        }}
      />
      <NumericReadout ref={readout} def={def} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}
