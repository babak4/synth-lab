import { getParamDef, type ParamId, type ParamValue } from '@/core/params/registry';
import { Knob } from './Knob';
import { Segmented } from './Segmented';
import { Select } from './Select';
import { Toggle } from './Toggle';
import type { BoolId, ContinuousId, EnumId } from './types';

interface Props<I extends ParamId> {
  id: I;
  value: ParamValue<I>;
  onChange: (value: ParamValue<I>) => void;
  /** Enum controls render as `Segmented` when they have ≤ `segmentedMax` options, else `Select`. */
  variant?: 'segmented' | 'select';
  icons?: boolean;
  disabled?: boolean;
}

/** Picks the right control for a registry id. Specific panels may use the components directly. */
export function ParamControl<I extends ParamId>({ id, value, onChange, variant, icons, disabled }: Props<I>) {
  const def = getParamDef(id);
  switch (def.type) {
    case 'continuous':
      return <Knob id={id as ContinuousId} value={value as number} onChange={onChange as (v: number) => void} disabled={disabled} />;
    case 'bool':
      return <Toggle id={id as BoolId} value={value as boolean} onChange={onChange as (v: boolean) => void} disabled={disabled} />;
    case 'enum': {
      const props = { id: id as EnumId, value: value as string, onChange: onChange as (v: string) => void };
      return (variant ?? (def.options.length <= (icons ? 6 : 5) ? 'segmented' : 'select')) === 'segmented' ? (
        <Segmented {...props} icons={icons} disabled={disabled} />
      ) : (
        <Select {...props} disabled={disabled} />
      );
    }
  }
}
