import { useRef, type KeyboardEvent } from 'react';
import { getParamDef } from '@/core/params/registry';
import type { EnumParamDef } from '@/core/params/types';
import { HelpButton } from './HelpButton';
import { WaveIcon } from './waveform-icons';
import type { EnumId } from './types';

interface Props {
  id: EnumId;
  value: string;
  onChange: (value: string) => void;
  /** Show waveform glyphs (option values are looked up in the icon set). */
  icons?: boolean;
  noHelp?: boolean;
  disabled?: boolean;
}

/** Radio group with roving tabindex and arrow-key navigation. */
export function Segmented({ id, value, onChange, icons, noHelp, disabled }: Props) {
  const def = getParamDef(id) as EnumParamDef;
  const group = useRef<HTMLDivElement>(null);

  const move = (e: KeyboardEvent, dir: 1 | -1 | 'first' | 'last') => {
    e.preventDefault();
    const n = def.options.length;
    const i = def.options.findIndex((o) => o.value === value);
    const j = dir === 'first' ? 0 : dir === 'last' ? n - 1 : (i + dir + n) % n;
    onChange(def.options[j]!.value);
    queueMicrotask(() => group.current?.querySelectorAll<HTMLElement>('[role=radio]')[j]?.focus());
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(e, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(e, -1);
    else if (e.key === 'Home') move(e, 'first');
    else if (e.key === 'End') move(e, 'last');
  };

  return (
    <div className="control segmented" data-help-for={def.helpId} data-param={id}>
      <div className="control-label">
        <span id={`${id}-label`}>{def.shortLabel ?? def.label}</span>
        {!noHelp && <HelpButton helpId={def.helpId} label={def.label} />}
      </div>
      <div ref={group} role="radiogroup" aria-label={def.label} className="segmented-group" onKeyDown={onKeyDown}>
        {def.options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-label={o.label}
            title={o.label}
            tabIndex={o.value === value ? 0 : -1}
            className="segment"
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {icons ? <WaveIcon shape={o.value} /> : o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
