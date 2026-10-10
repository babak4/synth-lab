/** One looping white-noise buffer per context, shared by every voice. */
const cache = new WeakMap<BaseAudioContext, AudioBuffer>();
const SECONDS = 2;

export function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = cache.get(ctx);
  if (!buf) {
    buf = new AudioBuffer({ length: Math.round(ctx.sampleRate * SECONDS), sampleRate: ctx.sampleRate });
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    cache.set(ctx, buf);
  }
  return buf;
}
