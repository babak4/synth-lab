/**
 * PolyBLEP band-limited pulse oscillator (plan T1.3).
 * Plain JS and self-contained: AudioWorklet modules cannot import from the app bundle.
 *
 * Output = pulse(phase, width) with a PolyBLEP correction at both edges. `frequency` and `detune`
 * (cents) are summed per sample; `pulseWidth` is a-rate so an LFO can drive PWM without zipper noise.
 */
class PulseOscProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 0, minValue: -24000, maxValue: 24000, automationRate: 'a-rate' },
      { name: 'detune', defaultValue: 0, minValue: -4800, maxValue: 4800, automationRate: 'a-rate' },
      { name: 'pulseWidth', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
    ];
  }

  constructor() {
    super();
    this.phase = 0;
  }

  /** Band-limited step residual; t = phase, dt = phase increment per sample. */
  static polyBlep(t, dt) {
    if (t < dt) {
      const x = t / dt;
      return x + x - x * x - 1;
    }
    if (t > 1 - dt) {
      const x = (t - 1) / dt;
      return x * x + x + x + 1;
    }
    return 0;
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0][0];
    if (!out) return true;
    const freq = parameters.frequency;
    const detune = parameters.detune;
    const pw = parameters.pulseWidth;
    const fLen = freq.length;
    const dLen = detune.length;
    const wLen = pw.length;
    const sr = sampleRate;
    const nyquist = sr / 2;
    let phase = this.phase;

    for (let i = 0; i < out.length; i++) {
      let f = fLen > 1 ? freq[i] : freq[0];
      const cents = dLen > 1 ? detune[i] : detune[0];
      if (cents !== 0) f *= Math.pow(2, cents / 1200);
      f = Math.abs(f);
      if (f > nyquist) f = nyquist;
      const dt = f / sr;
      let w = wLen > 1 ? pw[i] : pw[0];
      // Keep both edges at least one sample apart so BLEP corrections never overlap.
      if (w < dt * 2) w = dt * 2;
      else if (w > 1 - dt * 2) w = 1 - dt * 2;

      // Rising edge at phase 0, falling edge at phase w.
      let v = phase < w ? 1 : -1;
      v += PulseOscProcessor.polyBlep(phase, dt);
      let shifted = phase - w;
      if (shifted < 0) shifted += 1;
      v -= PulseOscProcessor.polyBlep(shifted, dt);
      out[i] = v;

      phase += dt;
      if (phase >= 1) phase -= 1;
    }
    this.phase = phase;
    return true;
  }
}

registerProcessor('pulse-osc', PulseOscProcessor);
