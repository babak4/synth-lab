import { describe, expect, it } from 'vitest';
import { Envelope, LN_1000, RELEASE_TAIL, velocityScale, type ParamSink } from './envelope';

type Ev = { op: string; args: number[] };
const recorder = () => {
  const events: Ev[] = [];
  const sink: ParamSink = {
    setValueAtTime: (...args) => void events.push({ op: 'set', args }),
    linearRampToValueAtTime: (...args) => void events.push({ op: 'ramp', args }),
    setTargetAtTime: (...args) => void events.push({ op: 'target', args }),
    cancelScheduledValues: (...args) => void events.push({ op: 'cancel', args }),
  };
  return { events, sink };
};
const shape = { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.4 };

describe('Envelope model', () => {
  it('attacks linearly to the peak, then decays exponentially to the sustain level', () => {
    const e = new Envelope(recorder().sink);
    e.gateOn(1, shape, 1);
    expect(e.valueAt(0.5)).toBe(0);
    expect(e.valueAt(1)).toBe(0);
    expect(e.valueAt(1.05)).toBeCloseTo(0.5, 9); // halfway through a linear attack
    expect(e.valueAt(1.1)).toBeCloseTo(1, 9);
    // After the decay time, 60 dB of the (1 → 0.5) gap has been covered.
    expect(e.valueAt(1.1 + 0.2)).toBeCloseTo(0.5 + 0.5 / 1000, 6);
    expect(e.valueAt(5)).toBeCloseTo(0.5, 9);
  });

  it('release falls 60 dB in the release time', () => {
    const e = new Envelope(recorder().sink);
    e.gateOn(0, shape, 1);
    e.gateOff(2);
    const sustain = e.valueAt(2);
    expect(e.valueAt(2 + 0.4)).toBeCloseTo(sustain / 1000, 6);
    expect(e.endTime).toBeCloseTo(2 + 0.4 * RELEASE_TAIL, 9);
    expect(e.valueAt(e.endTime!)).toBeLessThan(sustain * 4e-5);
  });

  it('early release during attack holds the partial ramp value (no jump)', () => {
    const { sink, events } = recorder();
    const e = new Envelope(sink);
    e.gateOn(0, shape, 1);
    e.gateOff(0.05); // halfway up the attack
    expect(e.valueAt(0.05)).toBeCloseTo(0.5, 9);
    expect(e.valueAt(0.0500001)).toBeCloseTo(0.5, 5);
    // The partial ramp is re-added after the cancel so the param does not stall at 0.
    const ops = events.map((x) => x.op);
    const cancel = ops.lastIndexOf('cancel');
    expect(ops.slice(cancel)).toEqual(['cancel', 'ramp', 'set', 'target']);
    expect(events[cancel + 1]!.args[0]).toBeCloseTo(0.5, 9);
    expect(events[cancel + 1]!.args[1]).toBe(0.05);
  });

  it('early release during decay is continuous', () => {
    const e = new Envelope(recorder().sink);
    e.gateOn(0, shape, 1);
    const before = e.valueAt(0.15);
    e.gateOff(0.15);
    expect(e.valueAt(0.15)).toBeCloseTo(before, 12);
    expect(e.stageAt(0.16).stage).toBe('release');
  });

  it('retrigger during release restarts the attack from the current level', () => {
    const e = new Envelope(recorder().sink);
    e.gateOn(0, shape, 1);
    e.gateOff(1);
    const mid = e.valueAt(1.1);
    e.gateOn(1.1, shape, 1);
    expect(e.valueAt(1.1)).toBeCloseTo(mid, 12);
    // Attack time scales with the remaining distance, so the slope matches a fresh attack.
    const expectedAttack = 0.1 * (1 - mid);
    expect(e.valueAt(1.1 + expectedAttack)).toBeCloseTo(1, 9);
    expect(e.isGateOn).toBe(true);
    expect(e.endTime).toBeNull();
  });

  it('retrigger at the peak does not attack at all', () => {
    const e = new Envelope(recorder().sink);
    e.gateOn(0, { ...shape, sustain: 1 }, 1);
    e.gateOn(1, { ...shape, sustain: 1 }, 1);
    expect(e.valueAt(1)).toBeCloseTo(1, 9);
    expect(e.valueAt(1.0006)).toBeCloseTo(1, 9);
  });

  it('scales to the velocity-derived peak', () => {
    const e = new Envelope(recorder().sink);
    e.gateOn(0, shape, 0.4);
    expect(e.valueAt(0.1)).toBeCloseTo(0.4, 9);
    expect(e.valueAt(10)).toBeCloseTo(0.2, 9); // sustain 0.5 × peak
  });

  it('live sustain change glides to the new level; during attack it just re-plans the decay', () => {
    const e = new Envelope(recorder().sink);
    e.gateOn(0, shape, 1);
    e.setSustain(0.05, 0.2); // mid-attack
    expect(e.valueAt(0.05)).toBeCloseTo(0.5, 9);
    expect(e.valueAt(10)).toBeCloseTo(0.2, 9);
    e.setSustain(5, 0.9); // in sustain
    expect(e.valueAt(5)).toBeCloseTo(0.2, 6);
    expect(e.valueAt(20)).toBeCloseTo(0.9, 6);
  });

  it('reports stage and progress for the UI', () => {
    const e = new Envelope(recorder().sink);
    e.gateOn(0, shape, 1);
    expect(e.stageAt(0.05)).toMatchObject({ stage: 'attack', elapsed: 0.05 });
    expect(e.stageAt(0.2).stage).toBe('decay');
    expect(e.stageAt(0.1 + 0.2 + 0.5)).toMatchObject({ stage: 'sustain' });
    e.gateOff(3);
    expect(e.stageAt(3.1)).toMatchObject({ stage: 'release' });
    expect(e.stageAt(3.1).elapsed).toBeCloseTo(0.1, 9);
  });

  it('ignores a second gateOff and a gateOff before any gateOn', () => {
    const { sink, events } = recorder();
    const e = new Envelope(sink);
    e.gateOff(1);
    expect(events).toEqual([]);
    e.gateOn(0, shape, 1);
    e.gateOff(1);
    const n = events.length;
    e.gateOff(2);
    expect(events.length).toBe(n);
  });

  it('clamps a gateOff scheduled before its gateOn', () => {
    const e = new Envelope(recorder().sink);
    e.gateOn(5, shape, 1);
    e.gateOff(4);
    expect(e.endTime).toBeCloseTo(5 + 0.4 * RELEASE_TAIL, 9);
  });

  it('uses time constants of release/ln(1000)', () => {
    const { sink, events } = recorder();
    const e = new Envelope(sink);
    e.gateOn(0, shape, 1);
    e.gateOff(1);
    const target = events.filter((x) => x.op === 'target').at(-1)!;
    expect(target.args[2]).toBeCloseTo(0.4 / LN_1000, 12);
  });
});

describe('velocityScale', () => {
  it('sensitivity 0 ignores velocity; 1 is proportional; 0.5 blends', () => {
    expect(velocityScale(1, 0)).toBe(1);
    expect(velocityScale(127, 1)).toBe(1);
    expect(velocityScale(64, 1)).toBeCloseTo(64 / 127, 9);
    expect(velocityScale(0, 0.5)).toBeCloseTo(0.5, 9);
  });
});
