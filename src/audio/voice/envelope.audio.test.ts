import { describe, expect, it } from 'vitest';
import { Envelope } from './envelope';

const SR = 48000;
const shape = { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.4 };

/** Drive a real AudioParam with the envelope and compare every rendered sample to the model. */
async function compare(seconds: number, script: (e: Envelope) => void) {
  const ctx = new OfflineAudioContext(1, Math.round(SR * seconds), SR);
  const src = new ConstantSourceNode(ctx, { offset: 0 });
  src.connect(ctx.destination);
  src.start();
  const env = new Envelope(src.offset);
  script(env);
  const out = (await ctx.startRendering()).getChannelData(0);
  let worst = 0;
  let worstAt = 0;
  for (let i = 0; i < out.length; i++) {
    const err = Math.abs(out[i]! - env.valueAt(i / SR));
    if (err > worst) [worst, worstAt] = [err, i / SR];
  }
  return { out, env, worst, worstAt };
}

describe('Envelope vs a real AudioParam', () => {
  it('plain note: attack, decay, sustain, release', async () => {
    const { worst, worstAt } = await compare(2, (e) => {
      e.gateOn(0.1, shape, 1);
      e.gateOff(1);
    });
    expect(worst, `worst error at ${worstAt}s`).toBeLessThan(2e-3);
  });

  it('early release mid-attack', async () => {
    const { worst, worstAt, out } = await compare(1.5, (e) => {
      e.gateOn(0.1, shape, 1);
      e.gateOff(0.15);
    });
    expect(worst, `worst error at ${worstAt}s`).toBeLessThan(2e-3);
    expect(out[Math.round(SR * 0.15)]).toBeGreaterThan(0.4); // held at ~0.5, did not collapse to 0
  });

  it('early release mid-decay', async () => {
    const { worst, worstAt } = await compare(1.5, (e) => {
      e.gateOn(0, shape, 0.8);
      e.gateOff(0.2);
    });
    expect(worst, `worst error at ${worstAt}s`).toBeLessThan(2e-3);
  });

  it('retrigger mid-release and mid-attack', async () => {
    const { worst, worstAt } = await compare(2.5, (e) => {
      e.gateOn(0, shape, 1);
      e.gateOff(0.5);
      e.gateOn(0.7, shape, 1); // mid-release
      e.gateOn(0.73, shape, 1); // mid-attack of the retrigger
      e.gateOff(1.5);
    });
    expect(worst, `worst error at ${worstAt}s`).toBeLessThan(2e-3);
  });

  it('live sustain changes in attack and in sustain', async () => {
    const { worst, worstAt } = await compare(3, (e) => {
      e.gateOn(0, shape, 1);
      e.setSustain(0.05, 0.2);
      e.setSustain(1, 0.9);
      e.gateOff(2);
    });
    expect(worst, `worst error at ${worstAt}s`).toBeLessThan(2e-3);
  });

  it('timing is within ±2 ms: attack peak and 60 dB release point', async () => {
    const { out } = await compare(2, (e) => {
      e.gateOn(0.2, { attack: 0.05, decay: 0.1, sustain: 1, release: 0.3 }, 1);
      e.gateOff(1);
    });
    const ms = (n: number) => (n / SR) * 1000;
    const peakIdx = out.findIndex((v) => v >= 0.999);
    expect(Math.abs(ms(peakIdx) - 250)).toBeLessThan(2);
    // release from 1.0: should be at −60 dB (0.001) 300 ms after the gate-off.
    const relIdx = out.findIndex((v, i) => i > SR && v <= 0.001);
    expect(Math.abs(ms(relIdx) - 1300)).toBeLessThan(2);
  });
});
