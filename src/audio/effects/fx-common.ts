import { SMOOTHING } from '@/core/contracts/engine';

/** Time constant giving a ~15 ms ramp for bypass / mix moves. */
export const RAMP_TC = SMOOTHING.rampMs / 1000 / 3;

/** Smoothly move an AudioParam (exponential approach; click-free for gains). */
export function glide(p: AudioParam, value: number, at: number, tc = RAMP_TC): void {
  p.setTargetAtTime(value, at, tc);
}

/** Set `value` outright (construction / initial state) or glide to it. */
export function move(p: AudioParam, value: number, at: number, immediate: boolean, tc = RAMP_TC): void {
  if (immediate) p.value = value;
  else p.setTargetAtTime(value, at, tc);
}

export interface Effect {
  readonly input: AudioNode;
  readonly output: AudioNode;
  dispose(): void;
}

export const safeDisconnect = (n: AudioNode): void => {
  try {
    n.disconnect();
  } catch {
    /* already disconnected */
  }
};
