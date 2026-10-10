import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { getParamDef } from '@/core/params/registry';
import { formatValue, valueToNorm } from '@/core/params/scale';
import type { ContinuousParamDef } from '@/core/params/types';
import { HelpButton } from './HelpButton';
import { KNOB_START_DEG, KNOB_SWEEP_DEG, arcPath, dragValue, keyValue, knobAngle, polar, wheelValue } from './control-logic';
import type { ContinuousId } from './types';

interface Props {
  id: ContinuousId;
  value: number;
  onChange: (value: number) => void;
  /** Hide the (?) when the parent already provides one. */
  noHelp?: boolean;
  /** Shown but inert, e.g. pulse width while the waveform is not pulse. */
  disabled?: boolean;
}

const SIZE = 48;
const C = SIZE / 2;
const R = 19;

export function Knob({ id, value, onChange, noHelp, disabled }: Props) {
  const def = getParamDef(id) as ContinuousParamDef;
  const norm = valueToNorm(def, value);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; value: number } | null>(null);
  // Wheel must be a non-passive native listener so we can stop the page scrolling.
  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      onChange(wheelValue(def, value, e.deltaY, e.shiftKey));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [def, value, onChange, disabled]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag.current = { y: e.clientY, value };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onChange(dragValue(def, drag.current.value, e.clientY - drag.current.y, e.shiftKey));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const next = keyValue(def, value, e.key, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    onChange(next);
  };

  const angle = knobAngle(norm);
  const tip = polar(C, C, R - 2, angle);
  const inner = polar(C, C, R - 9, angle);
  const text = formatValue(def, value);

  return (
    <div className={`control knob${disabled ? ' is-disabled' : ''}`} data-help-for={def.helpId} data-param={id}>
      <div className="control-label">
        <span id={`${id}-label`}>{def.shortLabel ?? def.label}</span>
        {!noHelp && <HelpButton helpId={def.helpId} label={def.label} />}
      </div>
      <div
        ref={ref}
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={def.label}
        aria-orientation="vertical"
        aria-disabled={disabled || undefined}
        aria-valuemin={def.min}
        aria-valuemax={def.max}
        aria-valuenow={value}
        aria-valuetext={text}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => !disabled && onChange(def.default)}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <path d={arcPath(C, C, R, KNOB_START_DEG, KNOB_START_DEG + KNOB_SWEEP_DEG)} className="knob-track" />
          {norm > 0.001 && <path d={arcPath(C, C, R, KNOB_START_DEG, angle)} className="knob-value" />}
          <circle cx={C} cy={C} r={R - 5} className="knob-cap" />
          <line x1={inner.x} y1={inner.y} x2={tip.x} y2={tip.y} className="knob-pointer" />
        </svg>
      </div>
      <output className="control-value" aria-hidden="true">
        {text}
      </output>
    </div>
  );
}
