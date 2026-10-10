import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus, type EventMap } from '@/core/contracts/events';
import { createPatchStore } from './patch-store';
import { createTryThisStore } from './try-this';

let patchStore: ReturnType<typeof createPatchStore>;
let bus: EventBus<EventMap>;
let log: string[];
let timers: { fn: () => void; ms: number; id: number }[];
let store: ReturnType<typeof createTryThisStore>;
const exp = { title: 'T', description: 'D', patch: { 'filter-cutoff': 500, 'lfo-sync': true }, note: 60 };

beforeEach(() => {
  patchStore = createPatchStore();
  bus = new EventBus<EventMap>();
  log = [];
  timers = [];
  bus.on('note:on', (e) => log.push(`on ${e.pitch} ${e.source}`));
  bus.on('note:off', (e) => log.push(`off ${e.pitch}`));
  let id = 0;
  store = createTryThisStore({
    patchStore, bus, now: () => 0,
    setTimer: (fn, ms) => (timers.push({ fn, ms, id: ++id }), id),
    clearTimer: (h) => void (timers = timers.filter((t) => t.id !== h)),
  });
});
const p = () => patchStore.getState().patch.params;

describe('Set it up', () => {
  it('changes only the listed parameters and plays the demo note', () => {
    patchStore.getState().setParam('osc-a-waveform', 'square');
    store.getState().setUp('filter', 0, exp);
    expect(p()['filter-cutoff']).toBe(500);
    expect(p()['lfo-sync']).toBe(true);
    expect(p()['osc-a-waveform']).toBe('square'); // untouched by the experiment
    expect(log).toEqual(['on 60 audition']);
    expect(store.getState()).toMatchObject({ active: 'filter#0', showing: 'B' });
  });

  it('ends the demo note by itself, and never leaves a note stuck', () => {
    store.getState().setUp('filter', 0, exp);
    expect(timers.length).toBe(1);
    timers[0]!.fn();
    expect(log).toEqual(['on 60 audition', 'off 60']);
    store.getState().play();
    store.getState().play(); // a second play first ends the first note
    expect(log.slice(-3)).toEqual(['on 60 audition', 'off 60', 'on 60 audition']);
    expect(timers.length).toBe(1);
  });

  it('an experiment with no note changes the sound silently', () => {
    store.getState().setUp('x', 0, { ...exp, note: undefined });
    expect(log).toEqual([]);
  });
});

describe('A/B', () => {
  it('toggles between the sound before and after, replaying the note each time', () => {
    store.getState().setUp('filter', 0, exp);
    store.getState().toggle();
    expect(p()['filter-cutoff']).toBe(8000);
    expect(store.getState().showing).toBe('A');
    store.getState().toggle();
    expect(p()['filter-cutoff']).toBe(500);
    expect(log.filter((l) => l.startsWith('on')).length).toBe(3);
    // no overlapping notes: every "on" after the first was preceded by an "off"
    for (let i = 1; i < log.length; i++) if (log[i]!.startsWith('on')) expect(log[i - 1]).toMatch(/^off/);
  });

  it('keeps edits you make on one side when you switch away and back', () => {
    store.getState().setUp('filter', 0, exp);
    patchStore.getState().setParam('filter-cutoff', 777); // tweak B
    store.getState().toggle();
    store.getState().toggle();
    expect(p()['filter-cutoff']).toBe(777);
  });

  it('does nothing before an experiment is set up', () => {
    store.getState().toggle();
    expect(log).toEqual([]);
  });
});

describe('Undo', () => {
  it('restores the exact patch from before, and clears the experiment', () => {
    patchStore.getState().setParam('mix-osc-b', 0.3);
    const before = structuredClone(patchStore.getState().patch);
    store.getState().setUp('filter', 0, exp);
    store.getState().undo();
    expect(patchStore.getState().patch).toEqual(before);
    expect(store.getState().active).toBeNull();
  });

  it('after two experiments in a row, undo returns to the learner’s own patch, not the first demo', () => {
    const before = structuredClone(patchStore.getState().patch);
    store.getState().setUp('filter', 0, exp);
    store.getState().setUp('filter', 1, { ...exp, patch: { 'filter-cutoff': 100 } });
    expect(p()['lfo-sync']).toBe(false); // the first demo's change is gone
    store.getState().undo();
    expect(patchStore.getState().patch).toEqual(before);
  });

  it('stops a demo note that is still sounding', () => {
    store.getState().setUp('filter', 0, exp);
    store.getState().undo();
    expect(log.at(-1)).toBe('off 60');
    expect(timers).toEqual([]);
  });
});
