/**
 * One shared requestAnimationFrame loop for every visualiser (plan T2.3): a single rAF callback no
 * matter how many canvases subscribe, idle when nobody is subscribed, and paused while the tab is hidden.
 */
export type FrameCallback = (dtSeconds: number) => void;

const subscribers = new Set<FrameCallback>();
let handle = 0;
let last = 0;
/** Longest step we report; a tab returning from the background should not produce a huge dt. */
const MAX_DT = 0.1;

const stats = { frames: 0, avgMs: 0, maxMs: 0 };

/** Time spent drawing per frame (all visualisers together), for the 4 ms budget check. Resets on read. */
export function takeFrameStats(): { frames: number; avgMs: number; maxMs: number } {
  const out = { ...stats };
  stats.frames = 0;
  stats.avgMs = 0;
  stats.maxMs = 0;
  return out;
}

function tick(now: number): void {
  handle = 0;
  if (subscribers.size === 0 || document.hidden) return;
  const dt = last ? Math.min(MAX_DT, (now - last) / 1000) : 0;
  last = now;
  const t0 = performance.now();
  for (const fn of [...subscribers]) fn(dt);
  const cost = performance.now() - t0;
  stats.avgMs = (stats.avgMs * stats.frames + cost) / (stats.frames + 1);
  stats.frames++;
  stats.maxMs = Math.max(stats.maxMs, cost);
  schedule();
}

function schedule(): void {
  if (!handle && subscribers.size > 0 && !document.hidden) handle = requestAnimationFrame(tick);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    last = 0;
    schedule();
  });
}

export function subscribeFrames(fn: FrameCallback): () => void {
  subscribers.add(fn);
  schedule();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      if (handle) cancelAnimationFrame(handle);
      handle = 0;
      last = 0;
    }
  };
}

/** Test/diagnostic hook. */
export const frameSubscriberCount = (): number => subscribers.size;
