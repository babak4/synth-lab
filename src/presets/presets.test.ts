import { describe, expect, it } from 'vitest';
import { PresetSchema, createPatch, type Preset } from '@/core/contracts/patch';
import { CONTROL_HELP_IDS, SECTION_HELP_IDS, type PatchParams } from '@/core/params/registry';
import { FACTORY_PRESETS, INIT_PRESET, TEACHING_PRESETS } from './index';

const byId = (id: string) => FACTORY_PRESETS.find((p) => p.id === id)!;
const params = (id: string): PatchParams => byId(id).patch.params;

describe('factory presets: structure', () => {
  it('has Init plus twelve teaching presets', () => {
    expect(INIT_PRESET.id).toBe('init');
    expect(TEACHING_PRESETS.length).toBe(12);
    expect(FACTORY_PRESETS.length).toBe(13);
  });

  it('every preset validates against PresetSchema, with unique ids and names', () => {
    for (const p of FACTORY_PRESETS) expect(PresetSchema.safeParse(p).success, p.id).toBe(true);
    expect(new Set(FACTORY_PRESETS.map((p) => p.id)).size).toBe(FACTORY_PRESETS.length);
    expect(new Set(FACTORY_PRESETS.map((p) => p.name)).size).toBe(FACTORY_PRESETS.length);
  });

  it('Init is exactly the registry defaults', () => {
    expect(INIT_PRESET.patch.params).toEqual(createPatch().params);
  });

  it('every teaching preset says what it teaches, and that points at a real help entry', () => {
    const helpIds = new Set([...CONTROL_HELP_IDS, ...SECTION_HELP_IDS]);
    for (const p of FACTORY_PRESETS) {
      expect(p.teaches, `${p.id} teaches`).toBeTruthy();
      expect(helpIds.has(p.teaches!), `${p.id} → ${p.teaches}`).toBe(true);
      expect(p.description!.length, `${p.id} description`).toBeGreaterThan(40);
      expect(p.auditionPitch, `${p.id} audition pitch`).toBeGreaterThanOrEqual(24);
    }
  });

  it('patch names match preset names', () => {
    for (const p of FACTORY_PRESETS) expect(p.patch.name).toBe(p.name);
  });

  it('every teaching preset differs from Init (each one changes the sound)', () => {
    for (const p of TEACHING_PRESETS) expect(p.patch.params).not.toEqual(INIT_PRESET.patch.params);
  });

  it('presets are returned as full patches (defaults filled in from the registry)', () => {
    const p = params('plucked-bass');
    expect(Object.keys(p).length).toBe(Object.keys(createPatch().params).length);
    expect(p['osc-a-waveform']).toBe('sawtooth'); // not written in the JSON
  });
});

/** Each preset must actually implement the idea its description promises. */
const concepts: Record<string, (p: PatchParams) => boolean> = {
  'plucked-bass': (p) => p['filter-env-amount'] >= 0.5 && p['filter-env-sustain'] <= 0.1 && p['filter-env-decay'] <= 0.5 && p['filter-cutoff'] < 400,
  'warm-pad': (p) => p['amp-env-attack'] >= 0.5 && p['amp-env-release'] >= 1 && p['osc-b-waveform'] === 'sawtooth' && p['osc-b-fine'] !== 0,
  'vibrato-lead': (p) => p['lfo-destination'] === 'pitch' && p['lfo-depth'] >= 0.1 && p['lfo-depth'] <= 0.3 && p['lfo-rate'] >= 4 && p['lfo-rate'] <= 8,
  'wobble-bass': (p) => p['lfo-sync'] && p['lfo-destination'] === 'cutoff' && p['lfo-depth'] >= 0.4 && p['voice-mode'] === 'mono' && p['lfo-retrigger'],
  'pwm-strings': (p) => p['osc-a-waveform'] === 'pulse' && p['lfo-destination'] === 'pulse-width' && p['lfo-depth'] >= 0.4 && p['lfo-rate'] < 2,
  'supersaw-lead': (p) => p['osc-a-waveform'] === 'sawtooth' && p['osc-b-waveform'] === 'sawtooth' && Math.abs(p['osc-a-fine'] - p['osc-b-fine']) >= 15,
  organ: (p) => [p['osc-a-waveform'], p['osc-b-waveform'], p['sub-waveform']].every((w) => w === 'sine') && p['osc-b-octave'] === 1 && p['sub-octave'] === -1 && p['mix-sub'] > 0 && p['mix-osc-b'] > 0,
  'beating-sines': (p) => p['osc-a-waveform'] === 'sine' && p['osc-b-waveform'] === 'sine' && Math.abs(p['osc-b-fine']) >= 3 && Math.abs(p['osc-b-fine']) <= 15 && p['osc-b-octave'] === 0,
  'acid-squelch': (p) => p['filter-resonance'] >= 10 && p['filter-env-amount'] >= 0.5 && p['voice-mode'] === 'mono' && p['voice-glide'] > 0,
  'tremolo-keys': (p) => p['lfo-destination'] === 'amp' && p['lfo-depth'] >= 0.3 && p['lfo-rate'] >= 3,
  'ping-pong-pluck': (p) => p['delay-on'] && p['delay-pingpong'] && p['delay-feedback'] >= 0.45 && p['amp-env-sustain'] === 0,
  'wind-sweep': (p) => p['mix-noise'] >= 0.5 && p['mix-osc-a'] === 0 && p['filter-type'] === 'bandpass' && p['filter-env-amount'] >= 0.5,
};

describe('factory presets: each one demonstrates its concept', () => {
  it('has a concept check for every teaching preset', () => {
    expect(Object.keys(concepts).sort()).toEqual(TEACHING_PRESETS.map((p) => p.id).sort());
  });
  it.each(Object.entries(concepts))('%s', (id, check) => {
    expect(check(params(id)), `${id} does not implement its stated idea`).toBe(true);
  });
});

describe('factory presets: sensible playing ranges', () => {
  it('no preset uses a setting outside the registry range (schema would reject it) or needs more than 8 voices', () => {
    for (const p of FACTORY_PRESETS as Preset[]) expect(p.patch.params['voice-count']).toBeLessThanOrEqual(8);
  });
  it('bass presets are mono and auditioned low; leads high', () => {
    for (const id of ['plucked-bass', 'wobble-bass', 'acid-squelch']) {
      expect(params(id)['voice-mode']).toBe('mono');
      expect(byId(id).auditionPitch!).toBeLessThanOrEqual(43);
    }
    expect(byId('vibrato-lead').auditionPitch!).toBeGreaterThanOrEqual(64);
  });
});
