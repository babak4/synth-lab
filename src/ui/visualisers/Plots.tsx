import { useServices } from '@/app/context';
import { biquadMagnitude, logFrequencies, magnitudeToDb, type BiquadType } from '@/core/dsp/biquad';
import { velocityScale, type LfoShapeName } from '@/core/dsp/modulation';
import { dbToY, freqToX } from '@/core/viz/spectrum';
import { effectiveCutoffHz, envelopeDot, envelopePoints, lfoMarker, lfoPoints, type Point } from '@/core/viz/plots';
import { formatValue } from '@/core/params/scale';
import { getParamDef } from '@/core/params/registry';
import { useCanvas, type Colours } from './useCanvas';

const PAD = 4;

function clear(ctx: CanvasRenderingContext2D, w: number, h: number, c: Colours) {
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, w, h);
}

function stroke(ctx: CanvasRenderingContext2D, pts: Point[], w: number, h: number, style: string, width: number, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = PAD + p.x * (w - 2 * PAD);
    const y = h - PAD - p.y * (h - 2 * PAD);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const dot = (ctx: CanvasRenderingContext2D, p: Point, w: number, h: number, colour: string, r = 4) => {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(PAD + p.x * (w - 2 * PAD), h - PAD - p.y * (h - 2 * PAD), r, 0, Math.PI * 2);
  ctx.fill();
};

// ── filter ────────────────────────────────────────────────────────────────────────────────────

const FILTER_DB_MIN = -36;
const FILTER_DB_MAX = 24;
const FREQS = logFrequencies(160);

/** Frequency response of the filter; a fainter curve per sounding voice shows it moving with the envelope, LFO and key tracking. */
export function FilterResponsePlot() {
  const { engine, host, patchStore } = useServices();

  const ref = useCanvas(({ ctx, width: w, height: h, colours }) => {
    clear(ctx, w, h, colours);
    const p = patchStore.getState().patch.params;
    const type = p['filter-type'] as BiquadType;

    // 0 dB line and octave-ish gridlines
    ctx.strokeStyle = colours.grid;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    const zeroY = Math.round(h - PAD - dbToY(0, FILTER_DB_MIN, FILTER_DB_MAX) * (h - 2 * PAD)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    for (const hz of [100, 1000, 10000]) {
      const x = Math.round(PAD + freqToX(hz) * (w - 2 * PAD)) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    const curve = (cutoff: number): Point[] =>
      Array.from(biquadMagnitude(type, cutoff, p['filter-resonance'], FREQS, host.sampleRate), (m, i) => ({
        x: freqToX(FREQS[i]!),
        y: dbToY(magnitudeToDb(m), FILTER_DB_MIN, FILTER_DB_MAX),
      }));

    const lfoPhase = engine.getLfoPhase();
    const fp = {
      cutoff: p['filter-cutoff'],
      envAmount: p['filter-env-amount'],
      keyTracking: p['filter-key-tracking'],
      lfoDestination: p['lfo-destination'],
      lfoDepth: p['lfo-depth'],
      lfoShape: p['lfo-shape'] as LfoShapeName,
    };
    for (const v of engine.getVoiceStates().slice(-4)) {
      stroke(ctx, curve(effectiveCutoffHz(fp, v, lfoPhase, host.sampleRate / 2)), w, h, colours.accent, 1.5, v.held ? 0.55 : 0.25);
    }
    stroke(ctx, curve(p['filter-cutoff']), w, h, colours.text, 2);
  });

  const p = patchStore.getState().patch.params;
  const label = `Filter response: ${formatValue(getParamDef('filter-type'), p['filter-type'])} at ${formatValue(getParamDef('filter-cutoff'), p['filter-cutoff'])}`;
  return <canvas ref={ref} className="viz plot plot-filter" role="img" aria-label={label} data-viz="filter-plot" />;
}

// ── envelopes ─────────────────────────────────────────────────────────────────────────────────

/** ADSR shape with a dot for every sounding note showing where it is in the envelope. */
export function EnvelopePlot({ which }: { which: 'amp' | 'filter' }) {
  const { engine, patchStore } = useServices();

  const ref = useCanvas(({ ctx, width: w, height: h, colours }) => {
    clear(ctx, w, h, colours);
    const p = patchStore.getState().patch.params;
    const shape = { attack: p[`${which}-env-attack`], decay: p[`${which}-env-decay`], sustain: p[`${which}-env-sustain`], release: p[`${which}-env-release`] };
    const sens = p[`${which}-env-velocity`];
    stroke(ctx, envelopePoints(shape), w, h, colours.text, 2);
    for (const v of engine.getVoiceStates()) {
      const peak = velocityScale(v.velocity, sens);
      dot(ctx, envelopeDot(shape, v[which], peak), w, h, colours.accent, v.held ? 4.5 : 3.5);
    }
  });

  const name = which === 'amp' ? 'Amp' : 'Filter';
  return <canvas ref={ref} className="viz plot plot-env" role="img" aria-label={`${name} envelope shape`} data-viz={`${which}-env-plot`} />;
}

// ── LFO ───────────────────────────────────────────────────────────────────────────────────────

export function LfoPlot() {
  const { engine, patchStore } = useServices();

  const ref = useCanvas(({ ctx, width: w, height: h, colours }) => {
    clear(ctx, w, h, colours);
    const shape = patchStore.getState().patch.params['lfo-shape'] as LfoShapeName;
    ctx.strokeStyle = colours.grid;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(h / 2) + 0.5);
    ctx.lineTo(w, Math.round(h / 2) + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    stroke(ctx, lfoPoints(shape), w, h, colours.text, 2);
    dot(ctx, lfoMarker(shape, engine.getLfoPhase()), w, h, colours.accent, 4.5);
  });

  return <canvas ref={ref} className="viz plot plot-lfo" role="img" aria-label="LFO shape" data-viz="lfo-plot" />;
}
