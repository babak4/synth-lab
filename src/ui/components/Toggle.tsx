import { getParamDef } from '@/core/params/registry';
import { HelpButton } from './HelpButton';
import type { BoolId } from './types';

interface Props {
  id: BoolId;
  value: boolean;
  onChange: (value: boolean) => void;
  noHelp?: boolean;
  disabled?: boolean;
}

export function Toggle({ id, value, onChange, noHelp, disabled }: Props) {
  const def = getParamDef(id);
  return (
    <div className="control toggle" data-help-for={def.helpId} data-param={id}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        className="toggle-btn"
        disabled={disabled}
        onClick={() => onChange(!value)}
      >
        <span className="toggle-led" aria-hidden="true" />
        {def.label}
      </button>
      {!noHelp && <HelpButton helpId={def.helpId} label={def.label} />}
    </div>
  );
}
