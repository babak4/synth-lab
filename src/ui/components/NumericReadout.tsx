import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { parseValue } from '@/core/params/parse';
import { formatValue } from '@/core/params/scale';
import type { ContinuousParamDef } from '@/core/params/types';

interface Props {
  def: ContinuousParamDef;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * The number under a knob or slider. Click it (or focus it and press Enter or Space) to type an exact
 * value, with units: "2.5k", "300 ms", "-12 dB". Enter or clicking away commits, Esc cancels. A value
 * that cannot be read keeps the field open with a message; a value out of range is clamped, exactly
 * as dragging would.
 */
export interface NumericReadoutHandle {
  /** Open the editor. A focused knob or slider calls this on Enter, so keyboard users need not Tab to the number. */
  edit(): void;
}

export const NumericReadout = forwardRef<NumericReadoutHandle, Props>(function NumericReadout(
  { def, value, onChange, disabled },
  ref,
) {
  const text = formatValue(def, value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  /** Set when Enter/Esc already settled the edit, so the blur that follows does not commit again. */
  const settled = useRef(false);
  const refocus = useRef(false);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [editing]);

  const begin = () => {
    if (disabled) return;
    settled.current = false;
    setDraft(text);
    setError(null);
    setEditing(true);
  };
  useImperativeHandle(ref, () => ({ edit: begin }));

  const close = (returnFocus: boolean) => {
    settled.current = true;
    refocus.current = returnFocus;
    setEditing(false);
    setError(null);
  };

  const commit = (): boolean => {
    const r = parseValue(def, draft);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    if (r.value !== value) onChange(r.value);
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Keys typed here are text, not notes or shortcuts; keep them from reaching window handlers that
    // are not already guarded.
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (commit()) close(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  };

  if (!editing) {
    return (
      <button
        ref={button}
        type="button"
        className="control-value readout"
        disabled={disabled}
        aria-label={`Edit ${def.label} value. Currently ${text}`}
        onClick={begin}
      >
        {text}
      </button>
    );
  }

  return (
    <span className="readout-edit">
      <input
        ref={input}
        type="text"
        inputMode="decimal"
        className="readout-input"
        value={draft}
        aria-label={`${def.label} value`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (settled.current) return;
          // Clicking away commits a readable value; an unreadable one is dropped rather than trapping focus.
          commit();
          close(false);
        }}
      />
      {error && (
        <span id={errorId} role="alert" className="readout-error">
          {error}
        </span>
      )}
    </span>
  );
});
