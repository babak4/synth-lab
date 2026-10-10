/**
 * Tick source for the sequencer's lookahead scheduler (plan T5.2). Timers inside a Worker are not
 * throttled when the tab is in the background or the main thread is busy the way main-thread timers
 * are, so scheduling keeps its rhythm. The worker only says "tick"; all the work happens on the main
 * thread, where the engines live.
 */
type Command = { cmd: 'start'; ms: number } | { cmd: 'stop' };

let handle: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e: MessageEvent<Command>) => {
  if (handle !== null) clearInterval(handle);
  handle = null;
  if (e.data.cmd === 'start') handle = setInterval(() => self.postMessage('tick'), e.data.ms);
};
