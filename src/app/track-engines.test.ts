import { describe, expect, it } from 'vitest';
import type { AudioSynthEngine, TrackMixer } from '@/core/contracts/engine';
import { MockEngine } from '@/core/mock/mock-engine';
import { createProjectStore } from '@/state/project-store';
import { SelectedEngine } from './selected-engine';
import { TrackEngines } from './track-engines';

class FakeEngine extends MockEngine {
  output = {} as AudioNode;
  trackGain = 1;
  setTrackGain(g: number) {
    this.trackGain = g;
  }
}

class FakeMixer implements TrackMixer {
  calls: string[] = [];
  addTrack(id: string) {
    this.calls.push(`add:${id}`);
  }
  removeTrack(id: string) {
    this.calls.push(`remove:${id}`);
  }
  setVolumeDb(id: string, db: number) {
    this.calls.push(`vol:${id}:${db}`);
  }
  setMute(id: string, m: boolean) {
    this.calls.push(`mute:${id}:${m}`);
  }
  setSolo(id: string, s: boolean) {
    this.calls.push(`solo:${id}:${s}`);
  }
  dispose() {
    this.calls.push('dispose');
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup() {
  const project = createProjectStore();
  const mixer = new FakeMixer();
  const made: FakeEngine[] = [];
  const tracks = new TrackEngines(project, mixer, async (patch) => {
    const e = new FakeEngine(patch);
    made.push(e);
    return e as unknown as AudioSynthEngine;
  });
  await tracks.start();
  return { project, mixer, made, tracks };
}

describe('TrackEngines', () => {
  it('builds an engine per track and follows adds and deletes', async () => {
    const { project, mixer, made, tracks } = await setup();
    expect(tracks.count).toBe(1);
    project.getState().addTrack();
    await flush();
    expect(tracks.count).toBe(2);
    const [a, b] = project.getState().project.tracks.map((t) => t.id) as [string, string];
    project.getState().removeTrack(a);
    await flush();
    expect(tracks.count).toBe(1);
    expect(mixer.calls).toContain(`remove:${a}`);
    expect(tracks.get(b)).toBe(made[1]);
    expect(tracks.selected()).toBe(made[1]);
  });

  it('a track deleted while its engine is still loading is disposed, not leaked', async () => {
    const project = createProjectStore();
    const mixer = new FakeMixer();
    const made: FakeEngine[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const tracks = new TrackEngines(project, mixer, async (patch) => {
      const e = new FakeEngine(patch);
      made.push(e);
      if (made.length > 1) await gate;
      return e as unknown as AudioSynthEngine;
    });
    await tracks.start();
    project.getState().addTrack();
    await flush();
    const slow = project.getState().selectedTrackId;
    project.getState().removeTrack(slow);
    release();
    await flush();
    expect(made[1]!.disposed).toBe(true);
    expect(tracks.count).toBe(1);
    expect(mixer.calls.filter((c) => c.startsWith('add:'))).toHaveLength(1);
  });

  it('mirrors fader, mute and solo to the mixer only when they change', async () => {
    const { project, mixer } = await setup();
    const id = project.getState().selectedTrackId;
    mixer.calls.length = 0;
    project.getState().setTrackMute(id, true);
    await flush();
    expect(mixer.calls).toEqual([`mute:${id}:true`]);
    mixer.calls.length = 0;
    project.getState().setTrackPatch(id, { ...project.getState().project.tracks[0]!.patch, name: 'x' }); // a knob tweak
    await flush();
    expect(mixer.calls).toEqual([]);
  });

  it('sets the project tempo on every engine', async () => {
    const { project, made } = await setup();
    project.getState().addTrack();
    await flush();
    project.getState().setTempo(90);
    await flush();
    expect(made.map((e) => e.tempo)).toEqual([90, 90]);
  });

  it('sends a changed patch to engines that are not being edited', async () => {
    const { project, made } = await setup();
    project.getState().addTrack();
    await flush();
    const [a] = project.getState().project.tracks;
    const p = { ...a!.patch, params: { ...a!.patch.params, 'filter-cutoff': 640 } };
    project.getState().setTrackPatch(a!.id, p); // track a is not selected
    await flush();
    expect(made[0]!.getPatch().params['filter-cutoff']).toBe(640);
  });

  it('dispose stops following the project and disposes the mixer', async () => {
    const { project, mixer, tracks } = await setup();
    tracks.dispose();
    expect(mixer.calls).toContain('dispose');
    project.getState().addTrack();
    await flush();
    expect(tracks.count).toBe(0);
  });
});

describe('SelectedEngine', () => {
  it('forwards to whichever engine is selected and ignores calls when there is none', () => {
    const a = new MockEngine();
    const b = new MockEngine();
    let current: MockEngine | undefined = a;
    const proxy = new SelectedEngine(() => current, () => a.getPatch());
    proxy.noteOn(60, 100);
    current = b;
    proxy.noteOn(64, 100);
    proxy.noteOff(64);
    expect(a.soundingPitches).toEqual([60]);
    expect(b.soundingPitches).toEqual([]);
    current = undefined;
    expect(() => proxy.noteOn(67, 100)).not.toThrow();
    expect(proxy.getVoiceStates()).toEqual([]);
    expect(proxy.getPatch()).toEqual(a.getPatch());
    const buf = new Float32Array(4).fill(1);
    proxy.getAnalyser().getFloatTimeDomainData(buf);
    expect([...buf]).toEqual([0, 0, 0, 0]);
  });
});
