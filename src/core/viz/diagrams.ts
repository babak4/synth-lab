/** Maths behind the animated help diagrams (plan T4.5). Pure, so correctness is unit-tested. */

export type HarmonicShape = 'sine' | 'triangle' | 'sawtooth' | 'square';

/**
 * Relative amplitude of harmonic `n` (1 = fundamental) of an ideal waveform:
 * sawtooth 1/n; square odd n only, 1/n; triangle odd n only, 1/n²; sine only n = 1.
 * (Amplitudes are relative to the fundamental, not scaled for peak level.)
 */
export function harmonicAmplitude(shape: HarmonicShape, n: number): number {
  const odd = n % 2 === 1;
  switch (shape) {
    case 'sine':
      return n === 1 ? 1 : 0;
    case 'sawtooth':
      return 1 / n;
    case 'square':
      return odd ? 1 / n : 0;
    case 'triangle':
      return odd ? 1 / (n * n) : 0;
  }
}

export const harmonicSeries = (shape: HarmonicShape, count: number): number[] => Array.from({ length: count }, (_, i) => harmonicAmplitude(shape, i + 1));

/** Reconstruct one sample of the waveform at `phase` (0–1) from its harmonics (signs follow the Fourier series). */
export function additiveSample(shape: HarmonicShape, phase: number, count = 64): number {
  let s = 0;
  for (let n = 1; n <= count; n++) {
    const a = harmonicAmplitude(shape, n);
    if (a === 0) continue;
    const sign = shape === 'triangle' ? (((n - 1) / 2) % 2 === 0 ? 1 : -1) : shape === 'sawtooth' ? (n % 2 === 0 ? -1 : 1) : 1;
    s += sign * a * Math.sin(2 * Math.PI * n * phase);
  }
  return s;
}

/** How much a low-pass at `cutoffHarmonic` lets harmonic n through (2-pole, 12 dB/oct, flat below, −12 dB/oct above). */
export function lowPassGain(n: number, cutoffHarmonic: number): number {
  const r = n / Math.max(cutoffHarmonic, 1e-6);
  return 1 / Math.sqrt(1 + r ** 4);
}

/** Beat frequency of two tones. */
export const beatHz = (f1: number, f2: number): number => Math.abs(f1 - f2);

/** Amplitude envelope of two equal sines at f1, f2 at time t: |cos(π·Δf·t)|. */
export const beatEnvelope = (f1: number, f2: number, t: number): number => Math.abs(Math.cos(Math.PI * (f2 - f1) * t));

/** Frequencies of `voices` unison copies spread ±`spreadCents` around `hz`. */
export function unisonFrequencies(hz: number, voices: number, spreadCents: number): number[] {
  if (voices === 1) return [hz];
  return Array.from({ length: voices }, (_, i) => hz * 2 ** (((i / (voices - 1)) * 2 - 1) * spreadCents / 1200));
}
