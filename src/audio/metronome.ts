/** Metronome click (plan T5.2): a short sine blip, higher and louder on the downbeat. Single-use nodes. */
export const CLICK_HZ = { accent: 1568, beat: 1046.5 } as const;
const CLICK_PEAK = { accent: 0.5, beat: 0.3 } as const;
const CLICK_S = 0.04;

export function scheduleClick(ctx: BaseAudioContext, destination: AudioNode, time: number, accent: boolean): void {
  const kind = accent ? 'accent' : 'beat';
  const osc = new OscillatorNode(ctx, { type: 'sine', frequency: CLICK_HZ[kind] });
  const env = new GainNode(ctx, { gain: 0 });
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(CLICK_PEAK[kind], time + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_S);
  osc.connect(env).connect(destination);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };
  osc.start(time);
  osc.stop(time + CLICK_S + 0.01);
}
