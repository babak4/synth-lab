/**
 * Parameter definition types. Locked with the registry (plan T0.2).
 *
 * Value conventions (important for every consumer):
 * - Units are SI-ish: seconds for time, Hz for frequency, dB for gain-in-dB, cents, semitones.
 * - `unit: '%'` means the stored value is a FRACTION (0–1, or -1–1) and the display layer
 *   multiplies by 100. The engine therefore never divides by 100.
 */

export type Scale = 'linear' | 'log' | 'exp';

export type Unit =
  | ''
  | 'Hz'
  | 's'
  | 'cents'
  | 'semitones'
  | 'octaves'
  | '%'
  | 'dB'
  | 'Q'
  | 'voices'
  | 'velocity';

/** Where the engine applies a parameter. */
export type Stage = 'voice' | 'fx' | 'master' | 'ui';

/**
 * `patch`  – part of a track's sound; saved in presets and projects.
 * `global` – app-wide setting (master volume, keyboard player); never in a patch.
 */
export type ParamScope = 'patch' | 'global';

export type SectionId =
  | 'oscillators'
  | 'mixer'
  | 'filter'
  | 'ampEnv'
  | 'filterEnv'
  | 'lfo'
  | 'voicing'
  | 'distortion'
  | 'delay'
  | 'reverb'
  | 'master'
  | 'keyboard';

interface ParamBase {
  readonly id: string;
  readonly section: SectionId;
  readonly label: string;
  /** Compact text for crowded panels; the full `label` is still the accessible name. */
  readonly shortLabel?: string;
  /** Key of the control's help entry in content/help/controls/. */
  readonly helpId: string;
  readonly scope: ParamScope;
  readonly stage: Stage;
  /** Parameter smoothing time applied by the engine; 0 = apply immediately. */
  readonly smoothingMs: number;
}

export interface ContinuousParamDef extends ParamBase {
  readonly type: 'continuous';
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly scale: Scale;
  readonly unit: Unit;
  /** Quantisation step; 0 = continuous. A step of 1 on an integer range gives a stepped control. */
  readonly step: number;
}

export interface EnumOption<V extends string = string> {
  readonly value: V;
  readonly label: string;
}

export interface EnumParamDef<V extends string = string> extends ParamBase {
  readonly type: 'enum';
  readonly options: readonly EnumOption<V>[];
  readonly default: V;
}

export interface BoolParamDef extends ParamBase {
  readonly type: 'bool';
  readonly default: boolean;
}

export type ParamDef = ContinuousParamDef | EnumParamDef | BoolParamDef;

export interface SectionDef {
  readonly id: SectionId;
  readonly title: string;
  /** Key of the section's long help entry in content/help/sections/. */
  readonly helpId: string;
  /** Signal-flow order, used by the panel layout and the help index. */
  readonly order: number;
}
