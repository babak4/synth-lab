# Performance

Capacity target (PRD §7.4): **8 tracks × 8 voices with all effects on, no dropouts, on a 2020 MacBook Air (M1)**.

## Status

| Check | Result |
| --- | --- |
| 8×8, every effect on, hall reverb, **real time** (Apple M3, headless Chromium) | **keeps up** (audio-clock drift −1 ms over 10 s) |
| Same, on an M1 MacBook Air | **not measured** (no M1 available while building this) |
| Latency, UI frame time, 30-minute memory | not yet measured (T6.2) |

Treat the M3 result as an upper bound for the M1 Air. Someone with an M1 should run `/bench.html`
(see below) before the capacity target is called met.

## How it is measured

Two tools, and the difference matters:

1. **Live benchmark, `/bench.html`** (`npm run dev`). Builds 8 engines × 8 voices on a real-time
   `AudioContext`, plays for N seconds and reports *audio-clock drift*: how far the audio clock fell
   behind wall-clock time. Anything near 0 means the audio thread kept up; a large number means it
   dropped out. It also reports `playoutStats` underruns where the browser exposes them (none did in
   headless Chromium here, so drift is the signal we rely on) and main-thread stalls. Controls cover
   reverb size, delay, distortion, shared vs per-track reverb, and latency hint.
   `tests/e2e/bench.spec.ts` smoke-tests the page.
2. **Offline benchmark, `src/audio/testing/benchmark.ts`** (`npm run test:audio -- render`).
   Renders in an `OfflineAudioContext` and reports × real time. It is deterministic and CI-friendly,
   but **it overstates real-time headroom**: with per-track hall reverbs it reported 1.8× real time
   while the live page showed the audio clock running at only ~0.55× speed. Use it to catch
   regressions and compare changes, not as proof of capacity. Real-time rendering has a hard
   per-quantum deadline (~2.7 ms) that bursty work (convolution FFT blocks) can miss even when the
   average is fine.

Each voice is a saw + pulse + sub + noise through a resonant filter with envelope and LFO; each track
has distortion, ping-pong delay and reverb enabled.

## Results (Apple M3, headless Chromium, 48 kHz)

Live, 8 tracks × 8 voices, distortion + ping-pong delay + reverb, 10 s:

| Reverb | Convolvers | Audio-clock drift over 10 s |
| --- | --- | --- |
| hall, **per-track** convolvers | 8 | **4,445 ms: fails** (audio at ~0.55× speed) |
| hall, **shared** | 1 | −1 ms: keeps up |
| room, shared | 1 | 8 ms: keeps up |
| short, shared | 1 | 19 ms: keeps up |

Offline (× real time, 8×8): no effects 4.1 · distortion + delay 4.2 · shared hall 3.4 · per-track hall 1.8.

## What was fixed

The first full 8×8 measurement was 1.4× real time offline and failed badly live. Causes and fixes:

1. **One convolver per track was the dominant cost.** Convolution is linear, so
   `conv(a) + conv(b) = conv(a + b)` for sources using the same impulse. Tracks now send **post-fader**
   into a shared `ReverbHub` (one convolver per size, allocated only while some track uses it). The
   sound is identical (a test renders both ways and requires the difference to be below −60 dB). The
   one audible difference is DAW-style send behaviour: muting a track stops feeding the reverb, but
   what is already in the reverb rings out.
2. **Idle effects still cost full price.** A `ConvolverNode` runs whether or not it hears anything.
   Convolvers now exist only while a send is attached, and are released after the impulse's length
   once the last send detaches. The delay worklet goes idle once its buffer has drained and its
   send is closed.
3. **Filter coefficient recalculation.** Audio-rate signals patched into a `BiquadFilterNode`'s
   `detune` make the browser recompute coefficients every sample. Filter `frequency`, `detune` and `Q`
   now run at control rate (once per 128-frame quantum, ~375 Hz), plenty for envelopes and LFOs ≤ 20 Hz.
4. **Reverb tails shortened.** Impulses end at ~−66 dB (RT60 × 1.1), not ~−80 dB. Hall RT60 is 3.0 s.

## Wiring requirement for the mixer (T5.1, done)

Done in `src/app/runtime.ts`: one `ReverbHub` and one `WebTrackMixer` for the project, and `TrackEngines` builds every track's engine with that hub.

Create **one** `ReverbHub` per project, with the master input as its destination, and pass it to every
`createSynthEngine(..., { reverbHub })`. Without it each engine builds a private hub, which sounds the
same but brings back the per-track CPU cost. The `TrackMixer` drives `engine.setTrackGain()`; the
engine applies it *before* the reverb send.

## Still open (T6.2)

- Measure on an M1 MacBook Air; record latency (key → sound), UI frame time while playing, and memory
  over a 30-minute session.
- Possible further savings if needed: skip oscillators whose mixer level is 0; a mono or shorter hall
  impulse; a quality setting.
