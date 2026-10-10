import type { PatchParamId } from '@/core/params/registry';
import { usePatchParam } from '@/app/context';
import { ParamControl } from '../components';

interface Props<I extends PatchParamId> {
  id: I;
  /** Waveform glyphs on a segmented enum. */
  icons?: boolean;
  variant?: 'segmented' | 'select';
  disabled?: boolean;
}

/** A registry-driven control bound to the patch store: the building block of every section panel. */
export function Param<I extends PatchParamId>({ id, icons, variant, disabled }: Props<I>) {
  const [value, set] = usePatchParam(id);
  return <ParamControl id={id} value={value} onChange={set} icons={icons} variant={variant} disabled={disabled} />;
}
