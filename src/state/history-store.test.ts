import { describe, expect, it } from 'vitest';
import { createPatch } from '@/core/contracts/patch';
import { MockEngine } from '@/core/mock/mock-engine';
import { createHistoryStore } from './history-store';
import { bindEngineToPatch, createPatchStore } from './patch-store';

function setup() {
  let clock = 0;
  const patchStore = createPatchStore();
  const h = createHistoryStore(patchStore, { now: () => clock });
  return { patchStore, h, tick: (ms: number) => (clock += ms), p: () => patchStore.getState().patch.params };
}

describe('patch history', () => {
  it('records a knob change, undoes it exactly, and redoes it', () => {
    const { patchStore, h, p } = setup();
    const before = structuredClone(patchStore.getState().patch);
    patchStore.getState().setParam('filter-cutoff', 1000);
    expect(h.getState()).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'Change Cutoff' });
    h.getState().undo();
    expect(patchStore.getState().patch).toEqual(before);
    expect(h.getState()).toMatchObject({ canUndo: false, canRedo: true, redoLabel: 'Change Cutoff' });
    h.getState().redo();
    expect(p()['filter-cutoff']).toBe(1000);
  });

  it('a drag (many changes to one control, quickly) is one undo step', () => {
    const { patchStore, h, tick, p } = setup();
    for (let v = 1000; v >= 200; v -= 20) {
      patchStore.getState().setParam('filter-cutoff', v);
      tick(16);
    }
    expect(h.history.snapshot().undoDepth).toBe(1);
    h.getState().undo();
    expect(p()['filter-cutoff']).toBe(8000);
  });

  it('changes to different controls are separate steps', () => {
    const { patchStore, h } = setup();
    patchStore.getState().setParam('filter-cutoff', 1000);
    patchStore.getState().setParam('filter-resonance', 5);
    expect(h.history.snapshot().undoDepth).toBe(2);
  });

  it('endGesture() splits two drags of the same control', () => {
    const { patchStore, h } = setup();
    patchStore.getState().setParam('filter-cutoff', 1000);
    h.getState().endGesture();
    patchStore.getState().setParam('filter-cutoff', 500);
    expect(h.history.snapshot().undoDepth).toBe(2);
  });

  it('loading a preset or applying a multi-setting experiment is one undoable step with a sensible label', () => {
    const { patchStore, h, p } = setup();
    patchStore
      .getState()
      .loadPatch(
        createPatch('Plucked Bass', {
          'filter-cutoff': 180,
          'filter-env-amount': 0.75,
          'voice-mode': 'mono',
        }),
      );
    expect(h.getState().undoLabel).toBe('Load “Plucked Bass”');
    patchStore
      .getState()
      .loadPatch({ ...patchStore.getState().patch, params: { ...p(), 'lfo-sync': true, 'lfo-depth': 0.5 } });
    expect(h.getState().undoLabel).toBe('Change 2 settings');
    h.getState().undo();
    h.getState().undo();
    expect(p()['filter-cutoff']).toBe(8000);
    expect(patchStore.getState().patch.name).toBe('Init');
  });

  it('undo does not record itself, and a new edit after undo clears redo', () => {
    const { patchStore, h } = setup();
    patchStore.getState().setParam('filter-cutoff', 1000);
    h.getState().undo();
    expect(h.history.snapshot().undoDepth).toBe(0);
    patchStore.getState().setParam('filter-cutoff', 2000);
    expect(h.getState().canRedo).toBe(false);
  });

  it('undo reaches the engine (the binding sees it as an ordinary patch change)', () => {
    const { patchStore, h } = setup();
    const engine = new MockEngine();
    bindEngineToPatch(patchStore, engine);
    patchStore.getState().setParam('filter-cutoff', 1000);
    expect(engine.getPatch().params['filter-cutoff']).toBe(1000);
    h.getState().undo();
    expect(engine.getPatch().params['filter-cutoff']).toBe(8000);
  });

  it('ignores no-op writes and stops recording after dispose', () => {
    const { patchStore, h } = setup();
    patchStore.getState().setParam('filter-cutoff', 8000); // same as the default: no change
    expect(h.getState().canUndo).toBe(false);
    h.dispose();
    patchStore.getState().setParam('filter-cutoff', 1000);
    expect(h.getState().canUndo).toBe(false);
  });

  it('keeps 200 steps', () => {
    const { patchStore, h } = setup();
    for (let i = 0; i < 260; i++) {
      patchStore.getState().setParam('filter-cutoff', 100 + i);
      h.getState().endGesture();
    }
    expect(h.history.snapshot().undoDepth).toBe(200);
  });
});
