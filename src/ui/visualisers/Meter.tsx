import { useRef, useState } from 'react';
import { useServices } from '@/app/context';
import { initialMeter, meterFraction, stepMeter } from '@/core/viz/meter';
import { useCanvas } from './useCanvas';

/** Output level meter with peak hold and a latched clip indicator (click it to reset). */
export function Meter() {
  const { host } = useServices();
  const state = useRef(initialMeter());
  const [clipped, setClipped] = useState(false);
  const clippedRef = useRef(false);

  const ref = useCanvas(({ ctx, width, height, dt, colours }) => {
    const reading = host.getMeter();
    state.current = stepMeter(state.current, reading.peak, dt);
    ctx.canvas.setAttribute('aria-valuenow', String(Math.round(state.current.levelDb)));
    ctx.canvas.setAttribute('aria-valuetext', `${Math.round(state.current.levelDb)} dB`);
    if (reading.clipped !== clippedRef.current) {
      clippedRef.current = reading.clipped;
      setClipped(reading.clipped);
    }
    ctx.fillStyle = colours.bg;
    ctx.fillRect(0, 0, width, height);
    const h = meterFraction(state.current.levelDb) * height;
    ctx.fillStyle = state.current.levelDb > -3 ? colours.danger : colours.accent;
    ctx.fillRect(0, height - h, width, h);
    const hold = height - meterFraction(state.current.holdDb) * height;
    ctx.fillStyle = colours.text;
    ctx.fillRect(0, Math.min(height - 2, hold), width, 2);
  });

  return (
    <div className="meter-wrap">
      <button
        type="button"
        className={`clip-led${clipped ? ' on' : ''}`}
        aria-label={clipped ? 'Output clipped. Click to reset' : 'Clip indicator'}
        data-clipped={clipped}
        onClick={() => {
          host.resetClip();
          clippedRef.current = false;
          setClipped(false);
        }}
      >
        CLIP
      </button>
      <canvas ref={ref} className="viz meter" role="meter" aria-label="Output level" aria-valuemin={-60} aria-valuemax={0} data-viz="meter" />
    </div>
  );
}
