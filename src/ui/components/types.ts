import type { ParamId, ParamValue } from '@/core/params/registry';

/** Ids whose value type is number / boolean / an enum string. */
export type ContinuousId = { [I in ParamId]: ParamValue<I> extends number ? I : never }[ParamId];
export type BoolId = { [I in ParamId]: ParamValue<I> extends boolean ? I : never }[ParamId];
export type EnumId = { [I in ParamId]: ParamValue<I> extends string ? I : never }[ParamId];
