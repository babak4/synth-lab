import { useEffect, useRef } from 'react';
import { useServices } from '@/app/context';
import { mtof } from '@/core/pitch';
import { scopeTrace } from '@/core/viz/scope';
import { useCanvas } from './useCanvas';

/** Oscilloscope of the master output, triggered on the latest note's period so a held note stands still. */
export function Scope() {
  const { host, patchStore, bus } = useServices();
  const analyser = host.getAnalyser();
  const buf = useRef(new Float32Array(analyser.fftSize));
  const latest = useRef<number | null>(null);

  useEffect(() => {
    const off = bus.on('note:on', (e) => (latest.current = e.pitch));
    return off;
  }, [bus]);

  const ref = useCanvas(({ ctx, width, height, colours }) => {
    ctx.fillStyle = colours.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = colours.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2 + 0.5);
    ctx.lineTo(width, height / 2 + 0.5);
    ctx.stroke();

    analyser.getFloatTimeDomainData(buf.current);
    const tune = patchStore.getState().patch.params['master-tune'];
    const hz = latest.current === null ? null : mtof(latest.current, tune);
    const { start, offset, length } = scopeTrace(buf.current, analyser.fftSize === 0 ? 48000 : host.sampleRate, hz);

    ctx.strokeStyle = colours.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < length; i++) {
      // Sub-sample offset keeps a held note pixel-stationary frame to frame.
      const x = ((i - offset) / (length - 1)) * width;
      const y = height / 2 - buf.current[start + i]! * (height / 2 - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  return <canvas ref={ref} className="viz scope" role="img" aria-label="Oscilloscope of the output" data-viz="scope" />;
}
