/**
 * App-wide (non-patch) settings: master volume, keyboard player state. (Tempo lives in the project store.)
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { getParamDef, type GlobalParamId, type ParamValue } from '@/core/params/registry';
import { quantise } from '@/core/params/scale';
import type { ContinuousParamDef } from '@/core/params/types';

export interface AppState {
  masterVolumeDb: number;
  kbdOctave: number;
  kbdVelocity: number;
  audio: 'off' | 'starting' | 'on';
  /** True when key presses will play notes (window focused, not typing in a text field). */
  keyboardLive: boolean;
  setGlobal<I extends GlobalParamId>(id: I, value: ParamValue<I>): void;
  setAudio(state: AppState['audio']): void;
  setKeyboardLive(live: boolean): void;
}

export type AppStore = StoreApi<AppState>;

const clampTo = (id: GlobalParamId, v: number) => quantise(getParamDef(id) as ContinuousParamDef, v);

export function createAppStore(): AppStore {
  return createStore<AppState>()((set) => ({
    masterVolumeDb: getParamDef('master-volume').default,
    kbdOctave: getParamDef('kbd-octave').default,
    kbdVelocity: getParamDef('kbd-velocity').default,
    audio: 'off',
    keyboardLive: false,
    setGlobal: (id, value) =>
      set(() => {
        const v = clampTo(id, value as number);
        return id === 'master-volume' ? { masterVolumeDb: v } : id === 'kbd-octave' ? { kbdOctave: v } : { kbdVelocity: v };
      }),
    setAudio: (audio) => set({ audio }),
    setKeyboardLive: (keyboardLive) => set({ keyboardLive }),
  }));
}
