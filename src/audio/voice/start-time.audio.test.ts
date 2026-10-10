/**
 * A note scheduled ahead must sound exactly like the same note at time 0, only later. Oscillators are
 * started early (Chromium rounds late starts to a render quantum), so this guards that nothing leaks out
 * of a voice before its note: a gate or DC offset opening early would change the onset transient.
 */
import { describe, expect, it } from 'vitest';
import { createPatch, type Patch } from '@/core/contracts/patch';
import { renderPatch } from '../testing/render';

const SR = 48000;
const SHIFT_S = 0.2; // 75 render quanta, so the two renders see identical block alignment

const patchFor = (wave: string): Patch =>
  createPatch('t', {
    'osc-a-waveform': wave as never,
    'mix-osc-a': 1,
    'filter-cutoff': 1500,
    'filter-resonance': 6,
    'amp-env-attack': 0.002,
    'amp-env-velocity': 0,
  });

describe('future-scheduled notes', () => {
  for (const wave of ['pulse', 'sawtooth', 'square', 'sine']) {
    it(`${wave}: a note at t=0.2 is the t=0 note shifted by 0.2 s`, async () => {
      const note = (start: number) => [{ pitch: 57, start, duration: 0.15, velocity: 110 }];
      const now = (await renderPatch({ patch: patchFor(wave), notes: note(0), seconds: 0.6 })).mono;
      const later = (await renderPatch({ patch: patchFor(wave), notes: note(SHIFT_S), seconds: 0.6 })).mono;
      const shift = Math.round(SHIFT_S * SR);
      expect(Math.max(...later.subarray(0, shift).map(Math.abs)), 'silent before the note').toBeLessThan(1e-7);
      let worst = 0;
      for (let i = 0; i < now.length - shift; i++) worst = Math.max(worst, Math.abs(now[i]! - later[i + shift]!));
      expect(worst).toBeLessThan(1e-4);
    });
  }
});
