/** Live capacity benchmark page (plan T1.8). Open /bench.html and press Start. */
import { createPatch } from '@/core/contracts/patch';
import { createSynthEngine } from '@/audio/engine';
import { WebAudioHost } from '@/audio/host';
import { ReverbHub } from '@/audio/effects/reverb-hub';

interface PlayoutStats {
  underrunDuration: number;
  underrunEvents: number;
  totalDuration: number;
  averageLatency: number;
  maximumLatency: number;
}

export interface LiveBenchResult {
  tracks: number;
  voicesPerTrack: number;
  seconds: number;
  settings: string;
  /** null where the browser has no AudioContext.playoutStats. */
  underrunEvents: number | null;
  underrunSeconds: number | null;
  averageLatencyMs: number | null;
  /** How far the audio clock lagged wall-clock time, in ms. Large = the audio thread fell behind. */
  clockDriftMs: number;
  /** Worst gap between 100 ms main-thread ticks (UI responsiveness while the engine runs). */
  worstMainThreadStallMs: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const num = (id: string) => Number($<HTMLInputElement>(id).value);

async function run(): Promise<LiveBenchResult> {
  const tracks = num('tracks');
  const voices = num('voices');
  const seconds = num('seconds');
  const reverb = ($('reverb') as HTMLSelectElement).value as 'hall' | 'room' | 'short' | 'off';
  const latency = ($('latency') as HTMLSelectElement).value as AudioContextLatencyCategory;
  const host = new WebAudioHost(() => new AudioContext({ latencyHint: latency }));
  await host.start();
  host.setMasterVolumeDb(-24);
  const ctx = host.context;

  const patch = createPatch('bench', {
    'osc-a-waveform': 'sawtooth', 'osc-b-waveform': 'pulse', 'mix-osc-b': 0.6, 'mix-sub': 0.4, 'sub-waveform': 'sine',
    'mix-noise': 0.05, 'osc-b-fine': 12, 'filter-cutoff': 1800, 'filter-resonance': 6, 'filter-env-amount': 0.5,
    'lfo-depth': 0.3, 'lfo-destination': 'cutoff', 'amp-env-sustain': 1, 'dist-on': $<HTMLInputElement>('dist').checked,
    'delay-on': $<HTMLInputElement>('delay').checked, 'delay-pingpong': true, 'delay-feedback': 0.6,
    'reverb-on': reverb !== 'off', 'reverb-size': reverb === 'off' ? 'room' : reverb,
  });
  const shared = ($('shared') as HTMLInputElement).checked;
  const reverbHub = shared ? new ReverbHub(ctx, host.input) : undefined;
  const engines = [];
  for (let t = 0; t < tracks; t++) {
    const e = await createSynthEngine(ctx, patch, { reverbHub });
    e.output.connect(host.input);
    for (let v = 0; v < voices; v++) e.noteOn(36 + t * 3 + v * 2, 100);
    engines.push(e);
  }

  let worstStall = 0;
  let last = performance.now();
  const ticker = setInterval(() => {
    const now = performance.now();
    worstStall = Math.max(worstStall, now - last - 100);
    last = now;
  }, 100);

  const audio0 = ctx.currentTime;
  const wall0 = performance.now();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const audioElapsed = ctx.currentTime - audio0;
  const wallElapsed = (performance.now() - wall0) / 1000;
  clearInterval(ticker);

  const stats = (ctx as unknown as { playoutStats?: PlayoutStats }).playoutStats;
  const result: LiveBenchResult = {
    tracks,
    voicesPerTrack: voices,
    seconds,
    settings: `shared=${shared} reverb=${reverb} delay=${$<HTMLInputElement>('delay').checked} dist=${$<HTMLInputElement>('dist').checked} latency=${latency}`,
    underrunEvents: stats ? stats.underrunEvents : null,
    underrunSeconds: stats ? stats.underrunDuration : null,
    averageLatencyMs: stats ? Math.round(stats.averageLatency * 1000) : null,
    clockDriftMs: Math.round((wallElapsed - audioElapsed) * 1000),
    worstMainThreadStallMs: Math.max(0, Math.round(worstStall)),
  };
  engines.forEach((e) => e.dispose());
  await ctx.close();
  return result;
}

$('start').addEventListener('click', async () => {
  const out = $('result');
  $<HTMLButtonElement>('start').disabled = true;
  out.textContent = 'Running…';
  try {
    const r = await run();
    (window as unknown as { __benchResult: LiveBenchResult }).__benchResult = r;
    out.textContent = JSON.stringify(r, null, 2);
  } catch (err) {
    out.textContent = `Failed: ${String(err)}`;
  } finally {
    $<HTMLButtonElement>('start').disabled = false;
  }
});
