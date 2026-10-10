import { describe, expect, it } from 'vitest';
import { resolveGains, type ChannelState } from './mixing';

const ch = (id: string, o: Partial<ChannelState> = {}): ChannelState => ({ id, volumeDb: 0, mute: false, solo: false, ...o });

describe('resolveGains', () => {
  it('turns faders into linear gain, with -60 dB and below as silence', () => {
    const g = resolveGains([ch('a'), ch('b', { volumeDb: -6 }), ch('c', { volumeDb: -60 }), ch('d', { volumeDb: 6 })]);
    expect(g.get('a')).toBe(1);
    expect(g.get('b')).toBeCloseTo(0.501, 3);
    expect(g.get('c')).toBe(0);
    expect(g.get('d')).toBeCloseTo(1.995, 3);
  });

  it('mute silences a track', () => {
    expect(resolveGains([ch('a', { mute: true }), ch('b')]).get('a')).toBe(0);
  });

  it('solo silences every non-soloed track, and several solos coexist', () => {
    const g = resolveGains([ch('a', { solo: true }), ch('b'), ch('c', { solo: true })]);
    expect([g.get('a'), g.get('b'), g.get('c')]).toEqual([1, 0, 1]);
  });

  it('mute beats solo', () => {
    const g = resolveGains([ch('a', { solo: true, mute: true }), ch('b')]);
    expect([g.get('a'), g.get('b')]).toEqual([0, 0]);
  });

  it('with no solos everyone is audible again', () => {
    expect([...resolveGains([ch('a'), ch('b')]).values()]).toEqual([1, 1]);
  });
});
