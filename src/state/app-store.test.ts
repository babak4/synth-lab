import { describe, expect, it } from 'vitest';
import { createAppStore } from './app-store';

describe('app store', () => {
  it('starts at the registry defaults, with master volume at −12 dB', () => {
    const s = createAppStore().getState();
    expect(s.masterVolumeDb).toBe(-12);
    expect(s.kbdOctave).toBe(0);
    expect(s.kbdVelocity).toBe(96);
    expect(s.tempo).toBe(120);
    expect(s.audio).toBe('off');
  });

  it('clamps and quantises global params to their registry ranges', () => {
    const store = createAppStore();
    store.getState().setGlobal('kbd-octave', 9);
    expect(store.getState().kbdOctave).toBe(2);
    store.getState().setGlobal('kbd-octave', -9);
    expect(store.getState().kbdOctave).toBe(-3);
    store.getState().setGlobal('kbd-velocity', 200.4);
    expect(store.getState().kbdVelocity).toBe(127);
    store.getState().setGlobal('master-volume', 5);
    expect(store.getState().masterVolumeDb).toBe(0);
  });

  it('keeps tempo within 40–240 BPM', () => {
    const store = createAppStore();
    store.getState().setTempo(10);
    expect(store.getState().tempo).toBe(40);
    store.getState().setTempo(999);
    expect(store.getState().tempo).toBe(240);
    store.getState().setTempo(97.6);
    expect(store.getState().tempo).toBe(98);
  });
});
