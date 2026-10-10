import { getParamDef } from '@/core/params/registry';
import type { EnumParamDef } from '@/core/params/types';
import { HelpButton } from './HelpButton';
import type { EnumId } from './types';

interface Props {
  id: EnumId;
  value: string;
  onChange: (value: string) => void;
  noHelp?: boolean;
  disabled?: boolean;
}

export function Select({ id, value, onChange, noHelp, disabled }: Props) {
  const def = getParamDef(id) as EnumParamDef;
  return (
    <div className="control select" data-help-for={def.helpId} data-param={id}>
      <div className="control-label">
        <label htmlFor={`${id}-select`}>{def.shortLabel ?? def.label}</label>
        {!noHelp && <HelpButton helpId={def.helpId} label={def.label} />}
      </div>
      <select
        id={`${id}-select`}
        aria-label={def.label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {def.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
