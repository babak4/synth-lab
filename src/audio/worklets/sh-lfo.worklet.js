/**
 * Sample-and-hold LFO (plan T1.5): holds a random value in [-1, 1] and picks a new one each cycle.
 * Self-contained plain JS (AudioWorklet modules cannot import app code).
 */
class SampleHoldProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'frequency', defaultValue: 4, minValue: 0, maxValue: 1000, automationRate: 'a-rate' }];
  }

  constructor() {
    super();
    this.phase = 0;
    this.value = Math.random() * 2 - 1;
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0][0];
    if (!out) return true;
    const freq = parameters.frequency;
    for (let i = 0; i < out.length; i++) {
      this.phase += (freq.length > 1 ? freq[i] : freq[0]) / sampleRate;
      if (this.phase >= 1) {
        this.phase -= Math.floor(this.phase);
        this.value = Math.random() * 2 - 1;
      }
      out[i] = this.value;
    }
    return true;
  }
}

registerProcessor('sample-hold-lfo', SampleHoldProcessor);
