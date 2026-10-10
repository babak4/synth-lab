/**
 * Stereo feedback delay (plan T1.6). Wet signal only; the wrapper adds dry path and mix.
 *
 * Why a worklet and not DelayNode + feedback GainNode: Web Audio inserts an extra render quantum
 * (128 frames) into every feedback cycle in Chromium/WebKit, and where it lands depends on internal
 * graph ordering, so repeats drift away from the grid (bad for tempo-synced delays). Here echo n is
 * exactly n × delayTime on every browser.
 *
 * Normal mode: L and R are independent lines fed back on themselves.
 * Ping-pong:   input goes to L only; L feeds R and R feeds L, so repeats alternate sides.
 * `pingpong` is morphed 0→1 so toggling it is click-free; `send` gates new input (0 lets the loop drain).
 * Feedback is clamped to 0.9 here too: the loop gain can never reach unity.
 */
const MAX_FEEDBACK = 0.9;

class StereoDelayProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'delayTime', defaultValue: 0.3, minValue: 0.001, maxValue: 5, automationRate: 'k-rate' },
      { name: 'feedback', defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'pingpong', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'send', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    const maxSeconds = (options.processorOptions && options.processorOptions.maxSeconds) || 5;
    this.size = Math.ceil(maxSeconds * sampleRate) + 4;
    this.bufL = new Float32Array(this.size);
    this.bufR = new Float32Array(this.size);
    this.w = 0;
    this.init = false;
    this.delay = 0; // smoothed, in samples
    this.fb = 0;
    this.pp = 0;
    this.send = 0;
    // Consecutive near-silent writes; once the whole buffer has been silent and nothing is being sent,
    // the processor goes idle and costs next to nothing (a disabled delay is the common case).
    this.quiet = 0;
    // One-pole coefficients: ~50 ms for delay time (tape-style slide), ~10 ms for the rest.
    this.aDelay = 1 - Math.exp(-1 / (0.05 * sampleRate));
    this.aFast = 1 - Math.exp(-1 / (0.01 * sampleRate));
  }

  read(buf, delay) {
    let r = this.w - delay;
    if (r < 0) r += this.size;
    const i0 = Math.floor(r);
    const frac = r - i0;
    const a = buf[i0 % this.size];
    const b = buf[(i0 + 1) % this.size];
    return a + (b - a) * frac;
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0];
    const outL = out[0];
    const outR = out[1] || out[0];
    const inp = inputs[0];
    const inL = inp && inp[0];
    const inR = inp && (inp[1] || inp[0]);

    const tDelay = Math.min(5, Math.max(0.001, parameters.delayTime[0])) * sampleRate;
    const tFb = Math.min(MAX_FEEDBACK, Math.max(0, parameters.feedback[0]));
    const tPp = parameters.pingpong[0];
    const tSend = parameters.send[0];
    if (!this.init) {
      this.delay = tDelay;
      this.fb = tFb;
      this.pp = tPp;
      this.send = tSend;
      this.init = true;
    }

    if (tSend === 0 && this.send < 1e-4 && this.quiet > this.size) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      return true;
    }

    for (let i = 0; i < outL.length; i++) {
      this.delay += (tDelay - this.delay) * this.aDelay;
      this.fb += (tFb - this.fb) * this.aFast;
      this.pp += (tPp - this.pp) * this.aFast;
      this.send += (tSend - this.send) * this.aFast;

      const d = Math.max(1, this.delay);
      const yL = this.read(this.bufL, d);
      const yR = this.read(this.bufR, d);

      const l = inL ? inL[i] : 0;
      const r = inR ? inR[i] : 0;
      const mono = (l + r) * 0.5;
      const pp = this.pp;
      // Normal: each side gets its own input. Ping-pong: everything enters on the left.
      const sendL = this.send * (l * (1 - pp) + mono * pp);
      const sendR = this.send * (r * (1 - pp));
      const fbL = this.fb * (yL * (1 - pp) + yR * pp);
      const fbR = this.fb * (yR * (1 - pp) + yL * pp);

      const wl = sendL + fbL;
      const wr = sendR + fbR;
      this.quiet = Math.abs(wl) + Math.abs(wr) < 1e-7 ? this.quiet + 1 : 0;
      this.bufL[this.w] = wl;
      this.bufR[this.w] = wr;
      outL[i] = yL;
      outR[i] = yR;
      this.w = (this.w + 1) % this.size;
    }
    return true;
  }
}

registerProcessor('stereo-delay', StereoDelayProcessor);
