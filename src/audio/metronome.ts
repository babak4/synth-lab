/** Metronome click (plan T5.2): a short sine blip, higher and louder on the downbeat. Single-use nodes. */
export const CLICK_HZ = { accent: 1568, beat: 1046.5 } as const;
const CLICK_PEAK = { accent: 0.5, beat: 0.3 } as const;
const CLICK_S = 0.04;

/**
 * Schedule one click at `time`. Returns a function that cancels it (silences it at once, even if it has
 * not started yet, and frees its nodes). `onDone` runs when the click has ended or been cancelled.
 */
export function scheduleClick(ctx: BaseAudioContext, destination: AudioNode, time: number, accent: boolean, onDone?: () => void): () => void {
  const kind = accent ? 'accent' : 'beat';
  const osc = new OscillatorNode(ctx, { type: 'sine', frequency: CLICK_HZ[kind] });
  const env = new GainNode(ctx, { gain: 0 });
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(CLICK_PEAK[kind], time + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_S);
  osc.connect(env).connect(destination);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    osc.disconnect();
    env.disconnect();
    onDone?.();
  };
  osc.onended = finish;
  osc.start(time);
  osc.stop(time + CLICK_S + 0.01);
  return () => {
    if (done) return;
    try {
      osc.stop(0); // the last stop() call wins, and a time in the past ends the click now
    } catch {
      /* already stopped */
    }
    finish();
  };
}
