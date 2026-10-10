/**
 * Behavioural contract every SynthEngine must satisfy. Run against MockEngine (Node) and the real
 * engine (browser), so swapping one for the other needs no UI change (plan T1.7).
 */
import { expect, it } from 'vitest';
import type { SynthEngine } from './contracts/engine';
import { createPatch } from './contracts/patch';

export function engineContract(factory: () => Promise<SynthEngine> | SynthEngine) {
  it('round-trips params through setParam / getPatch', async () => {
    const e = await factory();
    e.setParam('filter-cutoff', 1234);
    e.setParam('osc-a-waveform', 'square');
    e.setParam('lfo-sync', true);
    const p = e.getPatch().params;
    expect(p['filter-cutoff']).toBe(1234);
    expect(p['osc-a-waveform']).toBe('square');
    expect(p['lfo-sync']).toBe(true);
    e.dispose();
  });

  it('loadPatch replaces the patch and getPatch returns a copy', async () => {
    const e = await factory();
    const next = createPatch('Other', { 'filter-cutoff': 500, 'amp-env-release': 1.5 });
    e.loadPatch(next);
    const got = e.getPatch();
    expect(got.name).toBe('Other');
    expect(got.params['filter-cutoff']).toBe(500);
    got.params['filter-cutoff'] = 1; // mutating the copy must not leak back
    expect(e.getPatch().params['filter-cutoff']).toBe(500);
    e.dispose();
  });

  it('reports voices for held notes, and none after allNotesOff', async () => {
    const e = await factory();
    e.noteOn(60, 100);
    e.noteOn(64, 100);
    expect(e.getVoiceStates().map((v) => v.pitch).sort()).toEqual([60, 64]);
    expect(e.getVoiceStates().every((v) => v.held)).toBe(true);
    e.allNotesOff();
    await settle();
    expect(e.getVoiceStates().filter((v) => v.held)).toEqual([]);
    e.dispose();
  });

  it('exposes an analyser with the structural subset the UI needs', async () => {
    const e = await factory();
    const a = e.getAnalyser();
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    expect(a.frequencyBinCount).toBe(a.fftSize / 2);
    expect(e.getLfoPhase()).toBeGreaterThanOrEqual(0);
    expect(e.getLfoPhase()).toBeLessThan(1);
    e.dispose();
  });

  it('accepts tempo, sustain and note events without throwing, and ignores calls after dispose', async () => {
    const e = await factory();
    e.setTempo(90);
    e.setSustain(true);
    e.noteOn(48, 80);
    e.noteOff(48);
    e.setSustain(false);
    e.dispose();
    expect(() => {
      e.noteOn(60, 100);
      e.noteOff(60);
      e.setParam('filter-cutoff', 100);
      e.dispose();
    }).not.toThrow();
  });
}

/** Let queued microtasks/timers run (real engines tear voices down asynchronously). */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));
