/**
 * Factory presets (plan T2.5a). Stored as JSON with only the parameters that differ from Init;
 * PatchSchema fills in the rest from the registry, so a preset stays valid as defaults evolve.
 */
import { parsePreset, type Preset } from '@/core/contracts/patch';
import raw from './factory-presets.json';

function load(): Preset[] {
  return (raw as unknown[]).map((entry, i) => {
    const r = parsePreset(entry);
    if (!r.ok) throw new Error(`Factory preset #${i} is invalid: ${r.error}`);
    return r.value;
  });
}

export const FACTORY_PRESETS: readonly Preset[] = load();
export const INIT_PRESET: Preset = FACTORY_PRESETS.find((p) => p.id === 'init')!;
export const TEACHING_PRESETS: readonly Preset[] = FACTORY_PRESETS.filter((p) => p.id !== 'init');
