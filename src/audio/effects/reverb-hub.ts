/**
 * Shared reverb convolvers (plan T1.6 / T6.2).
 *
 * Convolution is linear, so conv(a) + conv(b) = conv(a + b) for sources that use the same impulse.
 * One convolver per size, fed by every track's send, therefore sounds identical to a convolver per
 * track, at a fraction of the CPU (8 hall reverbs were the single biggest cost in the engine and made
 * 8 tracks × 8 voices miss real time). Sends are taken post-fader, as on a DAW send/return.
 *
 * A convolver exists only while at least one send is attached; after the last one detaches it is kept
 * for the length of its impulse so tails ring out, then released.
 */
import { safeDisconnect } from './fx-common';
import { IMPULSE_SPECS, TAIL_FACTOR, generateImpulse, type ReverbSize } from './impulse';

const buffers = new WeakMap<BaseAudioContext, Map<ReverbSize, AudioBuffer>>();

export function impulseBuffer(ctx: BaseAudioContext, size: ReverbSize): AudioBuffer {
  let m = buffers.get(ctx);
  if (!m) buffers.set(ctx, (m = new Map()));
  let b = m.get(size);
  if (!b) {
    const [l, r] = generateImpulse(size, ctx.sampleRate);
    b = new AudioBuffer({ numberOfChannels: 2, length: l.length, sampleRate: ctx.sampleRate });
    b.copyToChannel(l as Float32Array<ArrayBuffer>, 0);
    b.copyToChannel(r as Float32Array<ArrayBuffer>, 1);
    m.set(size, b);
  }
  return b;
}

interface Entry {
  conv: ConvolverNode;
  input: GainNode;
  refs: number;
  release: ReturnType<typeof setTimeout> | null;
}

/** Handle for one attached send. */
export interface ReverbPort {
  readonly size: ReverbSize;
  detach(): void;
}

export class ReverbHub {
  private readonly entries = new Map<ReverbSize, Entry>();
  private readonly out: GainNode;

  /** `destination` receives the wet signal of every size (typically the master input). */
  constructor(
    private readonly ctx: BaseAudioContext,
    destination: AudioNode,
  ) {
    this.out = new GainNode(ctx, { gain: 1 });
    this.out.connect(destination);
  }

  /** Number of convolvers currently allocated (CPU cost indicator; used by tests). */
  get activeConvolvers(): number {
    return this.entries.size;
  }

  attach(size: ReverbSize, source: AudioNode): ReverbPort {
    let e = this.entries.get(size);
    if (!e) {
      const input = new GainNode(this.ctx, { gain: 1 });
      const conv = new ConvolverNode(this.ctx, { buffer: impulseBuffer(this.ctx, size), disableNormalization: false });
      input.connect(conv).connect(this.out);
      e = { conv, input, refs: 0, release: null };
      this.entries.set(size, e);
    }
    if (e.release) clearTimeout(e.release);
    e.release = null;
    e.refs++;
    source.connect(e.input);

    let attached = true;
    return {
      size,
      detach: () => {
        if (!attached) return;
        attached = false;
        try {
          source.disconnect(e.input);
        } catch {
          /* already gone */
        }
        if (--e.refs > 0) return;
        const tailMs = (IMPULSE_SPECS[size].rt60 * TAIL_FACTOR + 0.5) * 1000;
        e.release = setTimeout(() => this.free(size, e), tailMs);
      },
    };
  }

  private free(size: ReverbSize, e: Entry): void {
    if (this.entries.get(size) !== e || e.refs > 0) return;
    safeDisconnect(e.input);
    safeDisconnect(e.conv);
    this.entries.delete(size);
  }

  dispose(): void {
    for (const e of this.entries.values()) {
      if (e.release) clearTimeout(e.release);
      safeDisconnect(e.input);
      safeDisconnect(e.conv);
    }
    this.entries.clear();
    safeDisconnect(this.out);
  }
}
