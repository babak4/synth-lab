import { useEffect, useMemo, useRef, useState } from 'react';
import { harmonicSeries, lowPassGain, unisonFrequencies, beatHz, type HarmonicShape } from '@/core/viz/diagrams';
import { lfoValue } from '@/core/dsp/modulation';
import { envelopeDot, envelopePoints } from '@/core/viz/plots';
import { subscribeFrames } from '../visualisers/raf-loop';

/** True when the user asks for less motion; diagrams then hold one informative frame. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Calls `update(seconds)` every frame, or once at `staticT` under reduced motion. */
function useClock(update: (t: number) => void, staticT: number) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef(update);
  ref.current = update; // eslint-disable-line react-hooks/refs
  // Reduced motion: no loop, so repaint the held frame after every render (inputs such as the chosen
  // waveform may have changed).
  useEffect(() => {
    if (reduced) ref.current(staticT);
  });
  useEffect(() => {
    if (reduced) return;
    let t = 0;
    ref.current(0);
    return subscribeFrames((dt) => ref.current((t += dt)));
  }, [reduced, staticT]);
}

const W = 300;
const H = 110;

function Figure({ label, caption, children }: { label: string; caption: string; children: React.ReactNode }) {
  return (
    <figure className="diagram">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="diagram-svg">
        {children}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// ── harmonics (and the filter sweeping them away) ─────────────────────────────────────────────

const COUNT = 16;

export function HarmonicsDiagram({ sweep }: { sweep: boolean }) {
  const [shape, setShape] = useState<HarmonicShape>('sawtooth');
  const amps = useMemo(() => harmonicSeries(shape, COUNT), [shape]);
  const bars = useRef<(SVGRectElement | null)[]>([]);
  const cut = useRef<SVGLineElement>(null);
  const bw = (W - 20) / COUNT;

  useClock((t) => {
    const cutoff = sweep ? 2 + 13 * (0.5 + 0.5 * Math.sin(t * 0.7 - 1.2)) : Infinity;
    amps.forEach((a, i) => {
      const h = a * (sweep ? lowPassGain(i + 1, cutoff) : 1) * (H - 26);
      const r = bars.current[i];
      if (r) {
        r.setAttribute('height', String(h));
        r.setAttribute('y', String(H - 14 - h));
      }
    });
    if (cut.current) {
      const x = 10 + (cutoff - 0.5) * bw;
      cut.current.setAttribute('x1', String(x));
      cut.current.setAttribute('x2', String(x));
      cut.current.style.display = sweep ? '' : 'none';
    }
  }, 6);

  return (
    <div className="diagram-wrap">
      <div role="group" aria-label="Waveform" className="diagram-tabs">
        {(['sine', 'triangle', 'sawtooth', 'square'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={shape === s} onClick={() => setShape(s)}>
            {s === 'sawtooth' ? 'Saw' : s[0]!.toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <Figure
        label={`Bar chart of the first ${COUNT} harmonics of a ${shape} wave${sweep ? ', with a low-pass filter sweeping across them' : ''}`}
        caption={sweep ? 'The filter cutoff (dashed) sweeps up and down; harmonics above it fade.' : 'Bars show how loud each harmonic is (1 is the fundamental).'}
      >
        {amps.map((_, i) => (
          <rect key={i} ref={(el) => void (bars.current[i] = el)} className="bar" x={10 + i * bw + 2} width={bw - 4} y={H - 14} height={0} rx={1} />
        ))}
        <line ref={cut} className="cutline" y1={4} y2={H - 14} />
        <line className="axis" x1={10} x2={W - 10} y1={H - 14} y2={H - 14} />
        <text className="axis-label" x={W / 2} y={H - 2} textAnchor="middle">harmonic number →</text>
      </Figure>
    </div>
  );
}

// ── ADSR ──────────────────────────────────────────────────────────────────────────────────────

const ADSR = { attack: 0.12, decay: 0.3, sustain: 0.55, release: 0.5 };
const GATE = 1.6;
const CYCLE = 3;

export function AdsrDiagram() {
  const dotRef = useRef<SVGCircleElement>(null);
  const pts = useMemo(() => envelopePoints(ADSR), []);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${10 + p.x * (W - 20)},${H - 18 - p.y * (H - 36)}`).join(' ');

  useClock((time) => {
    const t = time % CYCLE;
    const s = ADSR;
    const level = (stage: string, e: number) =>
      stage === 'attack' ? e / s.attack : stage === 'decay' ? s.sustain + (1 - s.sustain) * Math.exp((-e / s.decay) * Math.log(1000)) : stage === 'release' ? s.sustain * Math.exp((-e / s.release) * Math.log(1000)) : s.sustain;
    const pos =
      t < s.attack ? { stage: 'attack' as const, elapsed: t }
      : t < s.attack + s.decay ? { stage: 'decay' as const, elapsed: t - s.attack }
      : t < GATE ? { stage: 'sustain' as const, elapsed: t - s.attack - s.decay }
      : { stage: 'release' as const, elapsed: t - GATE };
    const p = envelopeDot(s, { ...pos, level: level(pos.stage, pos.elapsed) }, 1);
    dotRef.current?.setAttribute('cx', String(10 + p.x * (W - 20)));
    dotRef.current?.setAttribute('cy', String(H - 18 - p.y * (H - 36)));
  }, 1);

  const labels = ['A', 'D', 'S', 'R'];
  const L = pts.length;
  const xs = [pts[Math.floor(L * 0.1)]!.x, pts[Math.floor(L * 0.4)]!.x, pts[Math.floor(L * 0.62)]!.x, pts[Math.floor(L * 0.87)]!.x];
  return (
    <Figure label="An ADSR envelope: attack, decay, sustain and release, with a dot following a note through them" caption="A key is pressed (attack, decay, sustain) then released (release).">
      <path d={d} className="curve" fill="none" />
      <circle ref={dotRef} className="dot" r={5} cx={10} cy={H - 18} />
      {labels.map((l, i) => (
        <text key={l} className="axis-label" x={10 + xs[i]! * (W - 20)} y={H - 4} textAnchor="middle">{l}</text>
      ))}
    </Figure>
  );
}

// ── LFO moving a target ───────────────────────────────────────────────────────────────────────

export function LfoTargetDiagram() {
  const dotA = useRef<SVGCircleElement>(null);
  const dotB = useRef<SVGCircleElement>(null);
  const curve = useMemo(() => Array.from({ length: 101 }, (_, i) => `${i ? 'L' : 'M'}${20 + (i / 100) * 160},${34 - lfoValue('sine', i / 100) * 22}`).join(' '), []);

  useClock((t) => {
    const phase = (t * 0.5) % 1;
    const v = lfoValue('sine', phase);
    dotA.current?.setAttribute('cx', String(20 + phase * 160));
    dotA.current?.setAttribute('cy', String(34 - v * 22));
    dotB.current?.setAttribute('cx', String(190 + (0.5 + 0.5 * v) * 90));
  }, 0.25);

  return (
    <Figure label="A slow wave on the left moves a dot along a slider on the right" caption="The LFO (left) moves the setting it is aimed at (right), such as the filter cutoff.">
      <text className="axis-label" x={100} y={12} textAnchor="middle">LFO</text>
      <path d={curve} className="curve" fill="none" />
      <circle ref={dotA} className="dot" r={4} cx={20} cy={34} />
      <text className="axis-label" x={235} y={12} textAnchor="middle">target (e.g. cutoff)</text>
      <rect className="track" x={190} y={30} width={90} height={8} rx={4} />
      <circle ref={dotB} className="dot" r={7} cx={235} cy={34} />
    </Figure>
  );
}

// ── beating ───────────────────────────────────────────────────────────────────────────────────

export function BeatingDiagram() {
  const sum = useRef<SVGPathElement>(null);
  const F1 = 20;
  const F2 = 22; // 2 beats per window
  useClock((t) => {
    const n = 220;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      const y = (Math.sin(2 * Math.PI * F1 * (x + t * 0.05)) + Math.sin(2 * Math.PI * F2 * (x + t * 0.05))) / 2;
      d += `${i ? 'L' : 'M'}${10 + x * (W - 20)},${H / 2 - y * 40}`;
    }
    sum.current?.setAttribute('d', d);
  }, 0);
  const env = (sign: number) => Array.from({ length: 101 }, (_, i) => `${i ? 'L' : 'M'}${10 + (i / 100) * (W - 20)},${H / 2 - sign * Math.abs(Math.cos(Math.PI * beatHz(F1, F2) * (i / 100))) * 40}`).join(' ');
  return (
    <Figure label="Two close tones added together: the combined wave swells and fades" caption="Two tones a hair apart drift in and out of step. The volume pulses at the difference in frequency.">
      <path d={env(1)} className="env" fill="none" />
      <path d={env(-1)} className="env" fill="none" />
      <path ref={sum} className="curve" fill="none" />
    </Figure>
  );
}

// ── unison ────────────────────────────────────────────────────────────────────────────────────

export function UnisonDiagram() {
  const lines = useRef<(SVGLineElement | null)[]>([]);
  const VOICES = 5;
  useClock((t) => {
    const spread = 4 + 26 * (0.5 + 0.5 * Math.sin(t * 0.8 - 1.5));
    unisonFrequencies(440, VOICES, spread).forEach((f, i) => {
      const x = W / 2 + (1200 * Math.log2(f / 440)) * 3.6;
      lines.current[i]?.setAttribute('x1', String(x));
      lines.current[i]?.setAttribute('x2', String(x));
    });
  }, 18);
  return (
    <Figure label="Five slightly detuned copies of one note, drawn as five lines that spread apart" caption="Unison stacks several copies of a note, each a few cents off. More spread sounds wider and thicker.">
      {Array.from({ length: VOICES }, (_, i) => (
        <line key={i} ref={(el) => void (lines.current[i] = el)} className="peak" x1={W / 2} x2={W / 2} y1={20} y2={H - 20} />
      ))}
      <line className="axis" x1={10} x2={W - 10} y1={H - 20} y2={H - 20} />
      <text className="axis-label" x={W / 2} y={H - 6} textAnchor="middle">frequency →</text>
    </Figure>
  );
}

export function Diagram({ name }: { name: string }) {
  switch (name) {
    case 'harmonics': return <HarmonicsDiagram sweep={false} />;
    case 'filter-sweep': return <HarmonicsDiagram sweep />;
    case 'adsr': return <AdsrDiagram />;
    case 'lfo-target': return <LfoTargetDiagram />;
    case 'beating': return <BeatingDiagram />;
    case 'unison': return <UnisonDiagram />;
    default: return null;
  }
}
