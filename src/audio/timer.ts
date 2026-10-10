/** Tick source for the scheduler: a Worker timer in the app, a manual one in tests. */
export interface TickTimer {
  start(onTick: () => void): void;
  stop(): void;
  dispose(): void;
}

export const TICK_MS = 25;

/**
 * Ticks every 25 ms from a Worker (see timer.worker.ts). Falls back to a main-thread interval where
 * Workers are unavailable or cannot start, so the sequencer still runs, only less steadily.
 */
export class WorkerTimer implements TickTimer {
  private worker: Worker | null = null;
  private fallback: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly intervalMs = TICK_MS) {}

  start(onTick: () => void): void {
    this.stop();
    try {
      this.worker ??= new Worker(new URL('./timer.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = () => onTick();
      this.worker.onerror = () => this.useFallback(onTick);
      this.worker.postMessage({ cmd: 'start', ms: this.intervalMs });
    } catch {
      this.useFallback(onTick);
    }
  }

  stop(): void {
    this.worker?.postMessage({ cmd: 'stop' });
    if (this.fallback !== null) clearInterval(this.fallback);
    this.fallback = null;
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
  }

  private useFallback(onTick: () => void): void {
    this.worker?.terminate();
    this.worker = null;
    if (this.fallback === null) this.fallback = setInterval(onTick, this.intervalMs);
  }
}

/** A timer that only ticks when told to; for offline tests that drive the scheduler themselves. */
export class ManualTimer implements TickTimer {
  running = false;
  private cb: (() => void) | null = null;
  start(onTick: () => void): void {
    this.running = true;
    this.cb = onTick;
  }
  stop(): void {
    this.running = false;
  }
  dispose(): void {
    this.running = false;
    this.cb = null;
  }
  tick(): void {
    if (this.running) this.cb?.();
  }
}
