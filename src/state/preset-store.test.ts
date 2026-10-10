import { beforeEach, describe, expect, it } from 'vitest';
import { createPatch } from '@/core/contracts/patch';
import { EventBus } from '@/core/contracts/events';
import { FACTORY_PRESETS } from '@/presets';
import { createPatchStore } from './patch-store';
import { createPresetStore, isEdited, type PresetStore } from './preset-store';
import { createBrokenStorage, createMemoryStorage } from './storage';

let patchStore: ReturnType<typeof createPatchStore>;
let storage: ReturnType<typeof createMemoryStorage>;
let store: PresetStore;

beforeEach(() => {
  patchStore = createPatchStore();
  storage = createMemoryStorage();
  store = createPresetStore({ patchStore, storage });
});

const params = () => patchStore.getState().patch.params;

describe('selecting presets', () => {
  it('starts on Init, matching the patch store', () => {
    expect(store.getState().currentId).toBe('init');
    expect(isEdited(store.getState(), params())).toBe(false);
  });

  it('loads a factory preset into the patch store (and so the engine)', () => {
    store.getState().select('plucked-bass');
    expect(params()['filter-cutoff']).toBe(180);
    expect(patchStore.getState().patch.name).toBe('Plucked Bass');
    expect(store.getState().currentId).toBe('plucked-bass');
    expect(isEdited(store.getState(), params())).toBe(false);
  });

  it('ignores an unknown id', () => {
    store.getState().select('nope');
    expect(store.getState().currentId).toBe('init');
  });

  it('flags edits, and restore puts the preset back exactly', () => {
    store.getState().select('warm-pad');
    patchStore.getState().setParam('filter-cutoff', 123);
    expect(isEdited(store.getState(), params())).toBe(true);
    store.getState().restore();
    expect(params()['filter-cutoff']).toBe(1400);
    expect(isEdited(store.getState(), params())).toBe(false);
  });

  it('a patch that matches no preset counts as edited', () => {
    store.setState({ currentId: null });
    expect(isEdited(store.getState(), params())).toBe(true);
  });

  it('announces the change on the event bus', () => {
    const seen: string[] = [];
    // the store uses the app-wide bus; subscribe to it
    return import('@/core/contracts/events').then(({ bus }) => {
      const off = bus.on('patch:load', () => seen.push('load'));
      store.getState().select('organ');
      off();
      expect(seen).toEqual(['load']);
      expect(EventBus).toBeDefined();
    });
  });
});

describe('user presets', () => {
  it('saves the current patch under a name, persists it, and makes it current', async () => {
    patchStore.getState().setParam('filter-cutoff', 777);
    const saved = await store.getState().saveAs('  My sound  ');
    expect(saved!.name).toBe('My sound');
    expect(saved!.patch.params['filter-cutoff']).toBe(777);
    expect(store.getState().user.map((p) => p.name)).toEqual(['My sound']);
    expect(store.getState().currentId).toBe(saved!.id);
    expect(isEdited(store.getState(), params())).toBe(false);
    expect(Object.keys(storage.dump())).toEqual([`preset:${saved!.id}`]);
  });

  it('survives a reload: a fresh store reads the saved presets back', async () => {
    patchStore.getState().setParam('lfo-depth', 0.4);
    const saved = (await store.getState().saveAs('Keeper'))!;
    const again = createPresetStore({ patchStore: createPatchStore(), storage });
    await again.getState().init();
    expect(again.getState().user.map((p) => p.id)).toEqual([saved.id]);
    expect(again.getState().user[0]!.patch.params['lfo-depth']).toBe(0.4);
    expect(again.getState().ready).toBe(true);
  });

  it('never reuses a name (factory or user): "Init" becomes "Init (2)"', async () => {
    const a = (await store.getState().saveAs('Init'))!;
    const b = (await store.getState().saveAs('Init'))!;
    expect([a.name, b.name]).toEqual(['Init (2)', 'Init (3)']);
  });

  it('rejects an empty name without changing anything', async () => {
    expect(await store.getState().saveAs('   ')).toBeNull();
    expect(store.getState().message?.kind).toBe('error');
    expect(store.getState().user).toEqual([]);
  });

  it('deletes user presets only, and clears the current marker if needed', async () => {
    const p = (await store.getState().saveAs('Temp'))!;
    await store.getState().remove('init');
    expect(store.getState().factory.some((f) => f.id === 'init')).toBe(true);
    await store.getState().remove(p.id);
    expect(store.getState().user).toEqual([]);
    expect(store.getState().currentId).toBeNull();
    expect(Object.keys(storage.dump())).toEqual([]);
  });

  it('skips a corrupt stored entry instead of failing', async () => {
    const good = createPatch('Good');
    const s = createMemoryStorage({
      'preset:a': { schemaVersion: 1, id: 'a', name: 'Good', patch: good },
      'preset:b': { garbage: true },
      'other:key': 'ignored',
    });
    const st = createPresetStore({ patchStore: createPatchStore(), storage: s });
    await st.getState().init();
    expect(st.getState().user.map((p) => p.id)).toEqual(['a']);
  });
});

describe('import / export', () => {
  it('exports a preset as JSON that imports back as an identical new preset', async () => {
    store.getState().select('supersaw-lead');
    const json = store.getState().exportJson('supersaw-lead')!;
    expect(JSON.parse(json).name).toBe('Supersaw Lead');
    const imported = (await store.getState().importJson(json))!;
    expect(imported.id).not.toBe('supersaw-lead'); // fresh id: cannot overwrite the original
    expect(imported.name).toBe('Supersaw Lead (2)');
    expect({ ...imported.patch.params }).toEqual({ ...FACTORY_PRESETS.find((p) => p.id === 'supersaw-lead')!.patch.params });
    expect(store.getState().currentId).toBe(imported.id);
  });

  it('refuses garbage, with a clear message and no state change', async () => {
    store.getState().select('organ');
    const before = structuredClone(patchStore.getState().patch);
    for (const bad of ['not json {', '{"hello":1}', JSON.stringify({ schemaVersion: 1, id: 'x', name: 'x', patch: { schemaVersion: 1, name: 'x', params: { 'filter-cutoff': 5 } } })]) {
      expect(await store.getState().importJson(bad)).toBeNull();
      expect(store.getState().message?.kind).toBe('error');
      expect(store.getState().message?.text).toMatch(/nothing was imported/i);
    }
    expect(store.getState().user).toEqual([]);
    expect(patchStore.getState().patch).toEqual(before);
  });

  it('export of an unknown id is null', () => {
    expect(store.getState().exportJson('nope')).toBeNull();
  });
});

describe('when storage is unavailable', () => {
  it('factory presets still work; saving reports why it failed and keeps the patch', async () => {
    const st = createPresetStore({ patchStore, storage: createBrokenStorage() });
    await st.getState().init();
    expect(st.getState().ready).toBe(true);
    expect(st.getState().message?.kind).toBe('error');
    st.getState().select('organ');
    expect(params()['osc-b-octave']).toBe(1);
    expect(await st.getState().saveAs('Nope')).toBeNull();
    expect(st.getState().message?.text).toMatch(/blocking local storage/i);
    expect(st.getState().user).toEqual([]);
  });
});
