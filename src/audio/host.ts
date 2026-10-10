/**
 * WebAudioHost (plan T1.1): owns the AudioContext lifecycle and the master chain.
 *
 * The context is created lazily and starts suspended; nothing is audible until `start()` is
 * called from a user gesture (browser autoplay rule, PRD §2).
 */
import type { AnalyserLike, AudioHost, AudioHostState, MeterReading } from '@/core/contracts/engine';
import { DEFAULT_MASTER_DB, createMasterChain, type MasterChain } from './master-chain';

type ContextFactory = () => AudioContext;

const defaultFactory: ContextFactory = () => new AudioContext({ latencyHint: 'interactive' });

export class WebAudioHost implements AudioHost {
  private ctx: AudioContext | null = null;
  private chain: MasterChain | null = null;
  private masterDb = DEFAULT_MASTER_DB;
  private listeners = new Set<(s: AudioHostState) => void>();

  constructor(private readonly factory: ContextFactory = defaultFactory) {}

  get state(): AudioHostState {
    if (!this.ctx) return 'uninitialised';
    // Safari reports 'interrupted' (e.g. after a phone call); treat it as suspended.
    return this.ctx.state === 'running' ? 'running' : this.ctx.state === 'closed' ? 'closed' : 'suspended';
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  /** Audio-layer access for engines. Creates the (suspended) context on first use. */
  get context(): AudioContext {
    return this.ensure().ctx;
  }

  /** Where engines connect their output. */
  get input(): AudioNode {
    return this.ensure().chain.input;
  }

  async start(): Promise<void> {
    const { ctx } = this.ensure();
    if (ctx.state !== 'running') await ctx.resume();
  }

  async stop(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend();
  }

  setMasterVolumeDb(db: number): void {
    this.masterDb = db;
    this.chain?.setVolumeDb(db);
  }

  getMeter(): MeterReading {
    return this.chain?.readMeter() ?? { peak: 0, rms: 0, clipped: false };
  }

  resetClip(): void {
    this.chain?.resetClip();
  }

  getAnalyser(): AnalyserLike {
    return this.ensure().chain.analyser;
  }

  onStateChange(listener: (state: AudioHostState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private ensure(): { ctx: AudioContext; chain: MasterChain } {
    if (!this.ctx || !this.chain) {
      this.ctx = this.factory();
      this.chain = createMasterChain(this.ctx, this.masterDb);
      this.ctx.addEventListener('statechange', () => this.listeners.forEach((l) => l(this.state)));
      this.listeners.forEach((l) => l(this.state));
    }
    return { ctx: this.ctx, chain: this.chain };
  }
}
