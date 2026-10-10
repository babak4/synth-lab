/**
 * Reverb send (plan T1.6): a per-track send into shared convolvers (see reverb-hub.ts).
 *
 *   in ─► out                                   (dry, always unity)
 *   in ─► send(mix) ─► port gain ─► hub[size] ─► … wet returns at the hub's destination
 *
 * Size changes crossfade between two port gains. When the effect is off the port is released shortly
 * after the send has faded, so an unused reverb costs nothing. Without a hub the effect creates a
 * private one that returns into `output`, so a lone engine (tests, offline renders) still has reverb.
 */
import { RAMP_TC, glide, move, safeDisconnect, type Effect } from './fx-common';
import { ReverbHub, type ReverbPort } from './reverb-hub';
import type { ReverbSize } from './impulse';

const SIZE_FADE_TC = 0.05 / 3;
/** Wall-clock delay before an off / replaced port is detached (long enough for its fade). */
const DETACH_AFTER_MS = 250;

interface Port {
  gain: GainNode;
  hubPort: ReverbPort;
}

export class Reverb implements Effect {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly send: GainNode;
  private readonly hub: ReverbHub;
  private readonly ownsHub: boolean;
  private active: Port | null = null;
  private fading: Port | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private on = false;
  private mix = 0.25;
  private size: ReverbSize;

  constructor(
    private readonly ctx: BaseAudioContext,
    size: ReverbSize = 'room',
    hub?: ReverbHub,
  ) {
    this.size = size;
    this.input = new GainNode(ctx);
    this.output = new GainNode(ctx);
    this.send = new GainNode(ctx, { gain: 0 });
    this.input.connect(this.output); // dry path, always unity
    this.input.connect(this.send);
    this.ownsHub = !hub;
    this.hub = hub ?? new ReverbHub(ctx, this.output);
  }

  /** True while this send is attached to a convolver. */
  get isActive(): boolean {
    return this.active !== null;
  }

  private open(size: ReverbSize, gain: number): Port {
    const g = new GainNode(this.ctx, { gain });
    this.send.connect(g);
    return { gain: g, hubPort: this.hub.attach(size, g) };
  }

  private close(p: Port): void {
    p.hubPort.detach();
    safeDisconnect(p.gain);
  }

  set(p: { on?: boolean; size?: ReverbSize; mix?: number }, at = this.ctx.currentTime, immediate = false): void {
    const wasOn = this.on;
    if (p.on !== undefined) this.on = p.on;
    if (p.mix !== undefined) this.mix = p.mix;
    if (p.size !== undefined) {
      const changed = p.size !== this.size;
      this.size = p.size;
      if (changed && this.on && this.active) this.changeSize(p.size, at);
    }

    if (this.on) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      if (!this.active) this.active = this.open(this.size, 1);
    } else if (wasOn && this.active) {
      const dying = this.active;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.on) return;
        this.close(dying);
        if (this.active === dying) this.active = null;
        if (this.fading) this.close(this.fading);
        this.fading = null;
      }, DETACH_AFTER_MS);
    }

    move(this.send.gain, this.on ? this.mix : 0, at, immediate, RAMP_TC);
  }

  private changeSize(size: ReverbSize, at: number): void {
    if (this.fading) this.close(this.fading); // an earlier fade-out that has not finished
    const old = this.active!;
    glide(old.gain.gain, 0, at, SIZE_FADE_TC);
    this.fading = old;
    this.active = this.open(size, 0);
    glide(this.active.gain.gain, 1, at, SIZE_FADE_TC);
    setTimeout(() => {
      if (this.fading === old) {
        this.close(old);
        this.fading = null;
      }
    }, DETACH_AFTER_MS + 150);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    for (const p of [this.active, this.fading]) if (p) this.close(p);
    this.active = this.fading = null;
    if (this.ownsHub) this.hub.dispose();
    [this.input, this.output, this.send].forEach(safeDisconnect);
  }
}
