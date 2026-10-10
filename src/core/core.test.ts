import { describe, expect, it } from 'vitest';
import {
  CONTROL_HELP_IDS,
  EventBus,
  MockAudioHost,
  MockEngine,
  PARAM_DEFS,
  PATCH_PARAM_DEFS,
  PPQ,
  SECTIONS,
  SECTION_HELP_IDS,
  createPatch,
  createProject,
  createTrack,
  defaultPatchParams,
  diffPatchParams,
  formatValue,
  getParamDef,
  normToValue,
  parsePatch,
  parseProject,
  parsePreset,
  quantise,
  ticksPerBar,
  valueToNorm,
  type AnalyserLike,
  type EventMap,
} from './index';

/** PRD §3.1–§3.7 + §5.2, one id per row of every control table. */
const PRD_CHECKLIST: Record<string, string[]> = {
  '3.1 oscillators': [
    ...['a', 'b'].flatMap((k) => ['waveform', 'octave', 'semitone', 'fine', 'pulse-width'].map((c) => `osc-${k}-${c}`)),
    'sub-waveform',
    'sub-octave',
  ],
  '3.1 mixer (A, B, sub, noise)': ['mix-osc-a', 'mix-osc-b', 'mix-sub', 'mix-noise'],
  '3.2 filter': ['filter-type', 'filter-cutoff', 'filter-resonance', 'filter-env-amount', 'filter-key-tracking'],
  '3.3 envelopes': ['amp', 'filter'].flatMap((e) =>
    ['attack', 'decay', 'sustain', 'release', 'velocity'].map((c) => `${e}-env-${c}`),
  ),
  '3.4 lfo': ['lfo-shape', 'lfo-sync', 'lfo-rate', 'lfo-division', 'lfo-depth', 'lfo-destination', 'lfo-retrigger'],
  '3.5 voicing': ['voice-mode', 'voice-count', 'voice-glide', 'master-tune'],
  '3.6 effects': [
    ...['dist-on', 'dist-drive', 'dist-tone', 'dist-mix'],
    ...['delay-on', 'delay-sync', 'delay-time', 'delay-division', 'delay-feedback', 'delay-pingpong', 'delay-mix'],
    ...['reverb-on', 'reverb-size', 'reverb-mix'],
  ],
  '3.7 master': ['master-volume'],
  '5.2 keyboard': ['kbd-octave', 'kbd-velocity'],
};

describe('parameter registry', () => {
  const ids = PARAM_DEFS.map((d) => d.id);

  it('covers every control in the PRD checklist', () => {
    const missing = Object.entries(PRD_CHECKLIST).flatMap(([sec, want]) =>
      want.filter((id) => !ids.includes(id as never)).map((id) => `${sec}: ${id}`),
    );
    expect(missing).toEqual([]);
  });

  it('has no ids outside the checklist (no undocumented controls)', () => {
    const all = new Set(Object.values(PRD_CHECKLIST).flat());
    expect(ids.filter((id) => !all.has(id))).toEqual([]);
  });

  it('has unique ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only references defined sections, and every section has a help id', () => {
    const sectionIds = new Set(SECTIONS.map((s) => s.id));
    for (const d of PARAM_DEFS) expect(sectionIds.has(d.section), d.id).toBe(true);
    for (const s of SECTIONS) expect(SECTION_HELP_IDS).toContain(s.helpId);
  });

  it('control help ids are unique and do not collide with section help ids', () => {
    expect(new Set(CONTROL_HELP_IDS).size).toBe(CONTROL_HELP_IDS.length);
    for (const id of SECTION_HELP_IDS) expect(CONTROL_HELP_IDS).not.toContain(id);
  });

  it('has sane ranges and in-range defaults', () => {
    for (const d of PARAM_DEFS) {
      if (d.type === 'continuous') {
        expect(d.min, d.id).toBeLessThan(d.max);
        expect(d.default, d.id).toBeGreaterThanOrEqual(d.min);
        expect(d.default, d.id).toBeLessThanOrEqual(d.max);
        if (d.scale === 'log') expect(d.min, `${d.id} log needs min>0`).toBeGreaterThan(0);
      } else if (d.type === 'enum') {
        expect(d.options.map((o) => o.value), d.id).toContain(d.default);
      }
    }
  });

  it('matches the PRD defaults and safety limits', () => {
    const p = defaultPatchParams();
    expect(p['osc-a-waveform']).toBe('sawtooth');
    expect(p['osc-b-waveform']).toBe('off');
    expect(p['mix-osc-a']).toBe(0.8);
    expect(p['filter-cutoff']).toBe(8000);
    expect(p['amp-env-sustain']).toBe(0.8);
    expect(p['filter-env-sustain']).toBe(0.3);
    expect(p['lfo-rate']).toBe(4);
    expect(p['voice-count']).toBe(8);
    expect(p['master-tune']).toBe(440);
    expect(getParamDef('delay-feedback').max).toBe(0.9); // feedback never reaches unity
    expect(getParamDef('master-volume').default).toBe(-12); // hearing safety
  });

  it('keeps only master volume and keyboard controls out of the patch', () => {
    const global = PARAM_DEFS.filter((d) => d.scope === 'global').map((d) => d.id);
    expect(global.sort()).toEqual(['kbd-octave', 'kbd-velocity', 'master-volume']);
    expect(PATCH_PARAM_DEFS.length + global.length).toBe(PARAM_DEFS.length);
  });

  it('keyboard octave range keeps both manuals within C0–C8 (MIDI 12–108)', () => {
    const { min, max } = getParamDef('kbd-octave');
    expect(48 + 12 * min).toBeGreaterThanOrEqual(12); // lower manual starts at C3 = 48
    expect(79 + 12 * max).toBeLessThanOrEqual(108); // upper manual ends at G5 = 79
  });
});

describe('scale helpers', () => {
  it('round-trips value ↔ position on linear, log and exp scales', () => {
    for (const id of ['filter-cutoff', 'amp-env-attack', 'voice-glide', 'osc-a-fine', 'lfo-rate'] as const) {
      const def = getParamDef(id);
      for (const n of [0, 0.25, 0.5, 0.75, 1]) {
        expect(valueToNorm(def, normToValue(def, n)), `${id}@${n}`).toBeCloseTo(n, 5);
      }
    }
  });

  it('maps the log midpoint of cutoff to the geometric mean', () => {
    expect(normToValue(getParamDef('filter-cutoff'), 0.5)).toBeCloseTo(Math.sqrt(20 * 20000), 3);
  });

  it('hits the range ends exactly and clamps out-of-range input', () => {
    const def = getParamDef('filter-cutoff');
    expect(normToValue(def, 0)).toBeCloseTo(20);
    expect(normToValue(def, 1)).toBeCloseTo(20000);
    expect(valueToNorm(def, 1e9)).toBe(1);
    expect(valueToNorm(def, -5)).toBe(0);
  });

  it('quantises to steps without float noise', () => {
    const kt = getParamDef('filter-key-tracking');
    expect(quantise(kt, 0.3)).toBe(0.5);
    expect(quantise(kt, 0.2)).toBe(0);
    expect(quantise(getParamDef('osc-a-octave'), 1.6)).toBe(2);
    expect(quantise(getParamDef('voice-count'), 3.4)).toBe(3);
  });

  it('formats values for display', () => {
    expect(formatValue(getParamDef('filter-cutoff'), 8000)).toBe('8.00 kHz');
    expect(formatValue(getParamDef('filter-cutoff'), 440)).toBe('440 Hz');
    expect(formatValue(getParamDef('amp-env-attack'), 0.005)).toBe('5.00 ms');
    expect(formatValue(getParamDef('amp-env-release'), 2)).toBe('2.00 s');
    expect(formatValue(getParamDef('mix-osc-a'), 0.8)).toBe('80%');
    expect(formatValue(getParamDef('osc-a-fine'), -12)).toBe('-12 cents');
    expect(formatValue(getParamDef('master-volume'), -12)).toBe('−12.0 dB');
    expect(formatValue(getParamDef('master-volume'), -60)).toBe('−∞ dB');
    expect(formatValue(getParamDef('lfo-sync'), true)).toBe('On');
    expect(formatValue(getParamDef('filter-type'), 'highpass')).toBe('High-pass');
  });
});

describe('patch schema', () => {
  it('round-trips a default patch unchanged', () => {
    const patch = createPatch('Test');
    const r = parsePatch(JSON.parse(JSON.stringify(patch)));
    expect(r).toEqual({ ok: true, value: patch });
  });

  it('fills missing params from registry defaults', () => {
    const r = parsePatch({ schemaVersion: 1, name: 'Sparse', params: { 'filter-cutoff': 500 } });
    expect(r.ok && r.value.params['filter-cutoff']).toBe(500);
    expect(r.ok && r.value.params['osc-a-waveform']).toBe('sawtooth');
  });

  it('rejects out-of-range, wrong-type, unknown-enum and bad-version patches', () => {
    const bad = (params: object, extra: object = {}) =>
      parsePatch({ schemaVersion: 1, name: 'x', params, ...extra }).ok;
    expect(bad({ 'filter-cutoff': 5 })).toBe(false);
    expect(bad({ 'delay-feedback': 0.95 })).toBe(false);
    expect(bad({ 'filter-cutoff': '500' })).toBe(false);
    expect(bad({ 'filter-type': 'comb' })).toBe(false);
    expect(bad({ 'lfo-sync': 1 })).toBe(false);
    expect(bad({}, { schemaVersion: 2 })).toBe(false);
    expect(bad({ 'filter-cutoff': NaN })).toBe(false);
  });

  it('validates presets', () => {
    const preset = { schemaVersion: 1, id: 'pluck', name: 'Pluck', teaches: 'envelopes', patch: createPatch('Pluck') };
    expect(parsePreset(preset).ok).toBe(true);
    expect(parsePreset({ ...preset, id: '' }).ok).toBe(false);
  });

  it('diffs only changed params', () => {
    const a = defaultPatchParams();
    const b = { ...a, 'filter-cutoff': 1000, 'lfo-sync': true };
    expect(diffPatchParams(a, b)).toEqual({ 'filter-cutoff': 1000, 'lfo-sync': true });
  });
});

describe('project schema', () => {
  it('round-trips a project with notes', () => {
    const project = createProject();
    project.tracks[0]!.notes.push({ id: 'n1', pitch: 60, start: 0, duration: PPQ, velocity: 100 });
    const r = parseProject(JSON.parse(JSON.stringify(project)));
    expect(r).toEqual({ ok: true, value: project });
  });

  it('computes ticks per bar for each supported signature', () => {
    expect(ticksPerBar({ numerator: 4, denominator: 4 })).toBe(3840);
    expect(ticksPerBar({ numerator: 3, denominator: 4 })).toBe(2880);
    expect(ticksPerBar({ numerator: 6, denominator: 8 })).toBe(2880);
  });

  it('rejects invalid notes, signatures, tempo, loops, duplicate ids and >8 tracks', () => {
    const base = () => structuredClone(createProject());
    const note = { id: 'n', pitch: 60, start: 0, duration: 1, velocity: 1 };
    const withNote = (n: object) => {
      const p = base();
      p.tracks[0]!.notes.push({ ...note, ...n });
      return parseProject(p).ok;
    };
    expect(withNote({})).toBe(true);
    expect(withNote({ duration: 0 })).toBe(false);
    expect(withNote({ pitch: 128 })).toBe(false);
    expect(withNote({ velocity: 0 })).toBe(false);
    expect(withNote({ start: -1 })).toBe(false);
    expect(withNote({ start: 1.5 })).toBe(false);

    const p1 = base();
    p1.timeSignature = { numerator: 5, denominator: 4 } as never;
    expect(parseProject(p1).ok).toBe(false);

    const p2 = base();
    p2.tempo = 300;
    expect(parseProject(p2).ok).toBe(false);

    const p3 = base();
    p3.loop = { enabled: true, startBar: 4, endBar: 20 };
    expect(parseProject(p3).ok).toBe(false);

    const p4 = base();
    p4.tracks.push({ ...p4.tracks[0]! });
    expect(parseProject(p4).ok).toBe(false);

    const p5 = base();
    p5.tracks = Array.from({ length: 9 }, (_, i) => createTrack(i));
    expect(parseProject(p5).ok).toBe(false);
  });
});

describe('event bus', () => {
  it('delivers typed events, supports unsubscribe, and isolates throwing listeners', () => {
    const bus = new EventBus<EventMap>();
    const seen: number[] = [];
    const off = bus.on('note:on', (e) => seen.push(e.pitch));
    bus.on('note:on', () => {
      throw new Error('boom');
    });
    bus.on('note:on', (e) => seen.push(e.pitch * 10));
    const spy = console.error;
    console.error = () => {};
    bus.emit('note:on', { pitch: 60, velocity: 100, source: 'keyboard', audioTime: 0 });
    off();
    bus.emit('note:on', { pitch: 62, velocity: 100, source: 'keyboard', audioTime: 0 });
    console.error = spy;
    expect(seen).toEqual([60, 600, 620]);
  });
});

describe('MockEngine', () => {
  it('logs calls and tracks sounding notes, including sustain', () => {
    const e = new MockEngine();
    e.noteOn(60, 100);
    e.noteOn(64, 100);
    e.setSustain(true);
    e.noteOff(60);
    expect(e.soundingPitches).toEqual([60, 64]);
    e.setSustain(false);
    expect(e.soundingPitches).toEqual([64]);
    e.allNotesOff();
    expect(e.soundingPitches).toEqual([]);
    expect(e.calls.map((c) => c.method)).toEqual(['noteOn', 'noteOn', 'setSustain', 'noteOff', 'setSustain', 'allNotesOff']);
  });

  it('applies params and patches without sharing references', () => {
    const e = new MockEngine();
    e.setParam('filter-cutoff', 1234);
    expect(e.getPatch().params['filter-cutoff']).toBe(1234);
    const p = createPatch('Other');
    e.loadPatch(p);
    p.params['filter-cutoff'] = 99;
    expect(e.getPatch().params['filter-cutoff']).toBe(8000);
  });

  it('host is silent until started', async () => {
    const h = new MockAudioHost();
    h.clock = 5;
    expect(h.currentTime).toBe(0);
    await h.start();
    expect(h.state).toBe('running');
    expect(h.currentTime).toBe(5);
  });

  it('SilentAnalyser satisfies the structural AnalyserNode subset', () => {
    // Compile-time check: a real AnalyserNode must be assignable to AnalyserLike.
    const _fromNode = (n: AnalyserNode): AnalyserLike => n;
    void _fromNode;
    const buf = new Float32Array(4).fill(1);
    new MockEngine().getAnalyser().getFloatTimeDomainData(buf);
    expect([...buf]).toEqual([0, 0, 0, 0]);
  });
});
