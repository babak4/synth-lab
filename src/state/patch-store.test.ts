import { describe, expect, it } from 'vitest';
import { createPatch } from '@/core/contracts/patch';
import { MockEngine } from '@/core/mock/mock-engine';
import { bindEngineToPatch, createPatchStore } from './patch-store';

describe('patch store', () => {
  it('updates one param immutably and ignores no-op writes', () => {
    const store = createPatchStore();
    const before = store.getState().patch;
    store.getState().setParam('filter-cutoff', 1000);
    expect(store.getState().patch).not.toBe(before);
    expect(before.params['filter-cutoff']).toBe(8000);
    const after = store.getState().patch;
    store.getState().setParam('filter-cutoff', 1000);
    expect(store.getState().patch).toBe(after);
  });

  it('loadPatch copies, so later edits to the source do not leak in', () => {
    const store = createPatchStore();
    const p = createPatch('X', { 'filter-cutoff': 300 });
    store.getState().loadPatch(p);
    p.params['filter-cutoff'] = 1;
    expect(store.getState().patch.params['filter-cutoff']).toBe(300);
  });
});

describe('bindEngineToPatch', () => {
  it('syncs the engine on bind, then forwards single edits as setParam', () => {
    const store = createPatchStore(createPatch('Start', { 'filter-cutoff': 400 }));
    const engine = new MockEngine();
    const unbind = bindEngineToPatch(store, engine);
    expect(engine.getPatch().params['filter-cutoff']).toBe(400);
    engine.calls.length = 0;

    store.getState().setParam('lfo-depth', 0.5);
    expect(engine.calls).toEqual([{ method: 'setParam', args: ['lfo-depth', 0.5, undefined] }]);
    unbind();
    store.getState().setParam('lfo-depth', 0.9);
    expect(engine.getPatch().params['lfo-depth']).toBe(0.5);
  });

  it('forwards a preset-sized change as one loadPatch', () => {
    const store = createPatchStore();
    const engine = new MockEngine();
    bindEngineToPatch(store, engine);
    engine.calls.length = 0;
    store.getState().loadPatch(
      createPatch('Pad', {
        'amp-env-attack': 1, 'amp-env-release': 2, 'filter-cutoff': 900, 'osc-a-waveform': 'triangle',
        'osc-b-waveform': 'sawtooth', 'mix-osc-b': 0.7, 'reverb-on': true, 'reverb-mix': 0.4,
      }),
    );
    expect(engine.calls.map((c) => c.method)).toEqual(['loadPatch']);
    expect(engine.getPatch().name).toBe('Pad');
  });
});
