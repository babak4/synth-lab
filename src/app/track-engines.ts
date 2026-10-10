/**
 * Keeps one engine per project track (plan T5.1): creates an engine when a track appears, removes it
 * (through the mixer, which disposes it) when the track goes, and mirrors fader, mute, solo, tempo and
 * the patches of tracks that are not being edited. Engines are built by an injected factory, so this is
 * tested with mock engines and wired to real audio only in the runtime.
 */
import type { AudioSynthEngine, TrackMixer } from '@/core/contracts/engine';
import type { Patch } from '@/core/contracts/patch';
import type { ProjectStore } from '@/state/project-store';

export class TrackEngines {
  private readonly engines = new Map<string, AudioSynthEngine>();
  private readonly pending = new Set<string>();
  /** The patch object last handed to each engine, so we only re-send a patch when the document changed it. */
  private readonly applied = new Map<string, Patch>();
  /** Fader / mute / solo / tempo last sent, so a knob tweak (which also changes the project) sends nothing. */
  private readonly mirrored = new Map<string, { volumeDb: number; mute: boolean; solo: boolean; tempo: number }>();
  private off: (() => void) | null = null;
  private stopped = false;

  constructor(
    private readonly projectStore: ProjectStore,
    private readonly mixer: TrackMixer,
    private readonly make: (patch: Patch) => Promise<AudioSynthEngine>,
  ) {}

  /** Builds the engines for the current tracks, then follows the project. */
  async start(): Promise<void> {
    await this.reconcile();
    this.off = this.projectStore.subscribe(() => void this.reconcile());
  }

  get(trackId: string): AudioSynthEngine | undefined {
    return this.engines.get(trackId);
  }

  selected(): AudioSynthEngine | undefined {
    return this.engines.get(this.projectStore.getState().selectedTrackId);
  }

  get count(): number {
    return this.engines.size;
  }

  dispose(): void {
    this.stopped = true;
    this.off?.();
    this.mixer.dispose();
    this.engines.clear();
  }

  private async reconcile(): Promise<void> {
    const { project, selectedTrackId } = this.projectStore.getState();
    const ids = new Set(project.tracks.map((t) => t.id));

    for (const id of [...this.engines.keys()]) {
      if (ids.has(id)) continue;
      this.engines.delete(id);
      this.applied.delete(id);
      this.mirrored.delete(id);
      this.mixer.removeTrack(id); // silences, disconnects and disposes
    }

    await Promise.all(
      project.tracks
        .filter((t) => !this.engines.has(t.id) && !this.pending.has(t.id))
        .map(async (t) => {
          this.pending.add(t.id);
          try {
            const engine = await this.make(t.patch);
            // The track may have been deleted (or the manager stopped) while the engine was loading.
            if (this.stopped || !this.projectStore.getState().project.tracks.some((x) => x.id === t.id)) {
              engine.dispose();
              return;
            }
            engine.setTempo(this.projectStore.getState().project.tempo);
            this.engines.set(t.id, engine);
            this.applied.set(t.id, t.patch);
            this.mixer.addTrack(t.id, engine);
          } finally {
            this.pending.delete(t.id);
          }
        }),
    );

    // Mirror the document onto the engines.
    const now = this.projectStore.getState();
    for (const t of now.project.tracks) {
      const engine = this.engines.get(t.id);
      if (!engine) continue;
      const last = this.mirrored.get(t.id);
      if (last?.volumeDb !== t.volumeDb) this.mixer.setVolumeDb(t.id, t.volumeDb);
      if (last?.mute !== t.mute) this.mixer.setMute(t.id, t.mute);
      if (last?.solo !== t.solo) this.mixer.setSolo(t.id, t.solo);
      if (last?.tempo !== now.project.tempo) engine.setTempo(now.project.tempo);
      this.mirrored.set(t.id, { volumeDb: t.volumeDb, mute: t.mute, solo: t.solo, tempo: now.project.tempo });
      // The selected track's patch reaches its engine through the editor (smoothed); other tracks get it here.
      if (t.id !== selectedTrackId && this.applied.get(t.id) !== t.patch) engine.loadPatch(t.patch);
      if (t.id !== selectedTrackId || this.applied.get(t.id) === undefined) this.applied.set(t.id, t.patch);
    }
  }
}
