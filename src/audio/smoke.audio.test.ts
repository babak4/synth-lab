import { expect, it } from 'vitest';

it('renders a sine through a real OfflineAudioContext', async () => {
  const ctx = new OfflineAudioContext(1, 4800, 48000);
  const osc = new OscillatorNode(ctx, { frequency: 440 });
  osc.connect(ctx.destination);
  osc.start();
  const buf = await ctx.startRendering();
  const peak = buf.getChannelData(0).reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  expect(peak).toBeGreaterThan(0.9);
});
