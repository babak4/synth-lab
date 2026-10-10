import { useRef } from 'react';
import { useServices } from '@/app/context';
import { binsToColumns, dbToY, spectrumGrid, visibleLabels } from '@/core/viz/spectrum';
import { useCanvas } from './useCanvas';

/** Spectrum analyser on a log frequency axis, labelled with note names (C2, C3…) and decade marks. */
export function Spectrum() {
  const { host, patchStore } = useServices();
  const analyser = host.getAnalyser();
  const bins = useRef(new Float32Array(analyser.frequencyBinCount));

  const ref = useCanvas(({ ctx, width, height, colours }) => {
    ctx.fillStyle = colours.bg;
    ctx.fillRect(0, 0, width, height);

    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    const grid = spectrumGrid(patchStore.getState().patch.params['master-tune']);
    const labelled = visibleLabels(grid, width);
    for (const g of grid) {
      const x = Math.round(g.x * width) + 0.5;
      ctx.strokeStyle = g.strong ? colours.gridStrong : colours.grid;
      ctx.globalAlpha = g.strong ? 0.6 : 0.35;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (labelled.has(g)) {
        ctx.fillStyle = colours.muted;
        ctx.fillText(g.label, x + 2, height - 2);
      }
    }

    analyser.getFloatFrequencyData(bins.current);
    const cols = binsToColumns(bins.current, host.sampleRate, Math.max(2, Math.floor(width)));
    ctx.fillStyle = colours.accent;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let c = 0; c < cols.length; c++) ctx.lineTo((c / (cols.length - 1)) * width, height - dbToY(cols[c]!, analyser.minDecibels, analyser.maxDecibels) * (height - 14));
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  return <canvas ref={ref} className="viz spectrum" role="img" aria-label="Spectrum analyser of the output" data-viz="spectrum" />;
}
