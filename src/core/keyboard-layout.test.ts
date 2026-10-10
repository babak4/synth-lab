import { describe, expect, it } from 'vitest';
import { DEFAULT_DIMENSIONS as D, FULL_RANGE, SIXTY_ONE, layoutKeys, pitchAt } from './keyboard-layout';

describe('layoutKeys', () => {
  it('a 61-key keyboard has 61 keys: 36 white and 25 black', () => {
    const l = layoutKeys(SIXTY_ONE.lo, SIXTY_ONE.hi);
    expect(l.keys.length).toBe(61);
    expect(l.keys.filter((k) => !k.black).length).toBe(36);
    expect(l.keys.filter((k) => k.black).length).toBe(25);
    expect(l.width).toBe(36 * D.whiteW);
  });

  it('the full piano has 88 keys: 52 white and 36 black', () => {
    const l = layoutKeys(FULL_RANGE.lo, FULL_RANGE.hi);
    expect(l.keys.length).toBe(88);
    expect(l.keys.filter((k) => !k.black).length).toBe(52);
    expect(l.keys.filter((k) => k.black).length).toBe(36);
  });

  it('white keys tile edge to edge with no gaps, left to right in pitch order', () => {
    const w = layoutKeys(36, 96).keys.filter((k) => !k.black);
    w.forEach((k, i) => expect(k.x).toBe(i * D.whiteW));
  });

  it('each black key straddles the join between its two neighbouring whites', () => {
    const l = layoutKeys(36, 96);
    const byPitch = new Map(l.keys.map((k) => [k.pitch, k]));
    for (const k of l.keys.filter((k) => k.black)) {
      const left = byPitch.get(k.pitch - 1)!;
      const right = byPitch.get(k.pitch + 1)!;
      expect(k.x + k.w / 2, `pitch ${k.pitch}`).toBeCloseTo(left.x + left.w, 9);
      expect(k.x + k.w / 2).toBeCloseTo(right.x, 9);
      expect(k.h).toBeLessThan(left.h);
    }
  });

  it('puts C4 (60) at the right place: 14 white keys in from C2', () => {
    const l = layoutKeys(36, 96);
    expect(l.xOf(60)).toBe(14 * D.whiteW); // C2 → C4 is two octaves of 7 white keys
  });
});

describe('pitchAt', () => {
  const l = layoutKeys(36, 96);
  it('finds the white key under a point, anywhere along its length', () => {
    expect(pitchAt(l, 2, 90)).toBe(36); // C2
    expect(pitchAt(l, D.whiteW + 3, 100)).toBe(38); // D2
  });
  it('a black key wins in its own area and the white key shows through below it', () => {
    const cs = l.keys.find((k) => k.pitch === 37)!;
    expect(pitchAt(l, cs.x + cs.w / 2, 10)).toBe(37);
    // Below the black key the white keys show through. Its exact centre is the join between C2 and D2, so
    // step off-centre to test each side.
    expect(pitchAt(l, cs.x + 2, D.blackH + 8)).toBe(36); // left of the join: C2
    expect(pitchAt(l, cs.x + cs.w - 2, D.blackH + 8)).toBe(38); // right of the join: D2
  });
  it('is null outside the keyboard', () => {
    expect(pitchAt(l, -1, 10)).toBeNull();
    expect(pitchAt(l, l.width + 1, 10)).toBeNull();
    expect(pitchAt(l, 10, D.whiteH + 1)).toBeNull();
  });
  it('every key is hittable at its own centre', () => {
    for (const k of l.keys) expect(pitchAt(l, k.x + k.w / 2, k.black ? k.h / 2 : k.h - 4), `pitch ${k.pitch}`).toBe(k.pitch);
  });
});
