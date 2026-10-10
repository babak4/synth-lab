---
id: oscillators
title: Oscillators
kind: section
related: [mixer, filter, osc-a-waveform, osc-b-waveform, osc-b-fine]
presets: [supersaw-lead, organ, beating-sines, pwm-strings]
tryThis:
  - title: Sine versus sawtooth
    description: Switch oscillator A to a sine and listen to how plain and soft it is. Then switch back to the sawtooth and hear the buzz return.
    patch: { osc-a-waveform: sine, filter-cutoff: 12000 }
    note: 57
  - title: Make two oscillators beat
    description: Two sine waves a few cents apart drift in and out of step. Listen for the slow pulsing, about once per second.
    patch: { osc-a-waveform: sine, osc-b-waveform: sine, mix-osc-b: 0.8, osc-b-fine: 8 }
    note: 57
  - title: Thicken it with detune
    description: Two sawtooths tuned slightly apart sound far bigger than one. Hear how the sound seems to shimmer and widen.
    patch: { osc-b-waveform: sawtooth, mix-osc-b: 0.8, osc-a-fine: -12, osc-b-fine: 12 }
    note: 57
---
## What it is

An [oscillator](term:oscillator) is where the sound starts: it makes a wave that repeats over and over. How fast it repeats sets the [pitch](term:pitch), and the shape of the wave sets the tone.

## What you'll hear

A [sine](term:sine) wave is pure and soft, with one [harmonic](term:harmonic) only. A [sawtooth](term:sawtooth) is bright and buzzy because it has every harmonic. A [square](term:square) is hollow, with only the odd ones. More harmonics means more for the [filter](help:filter) to work on later.

::diagram{name="harmonics"}

Two oscillators together can [beat](term:beating) or thicken each other when they are tuned slightly apart.

::diagram{name="beating"}

Stacking several slightly detuned copies of one note is called unison. The more they spread, the wider and thicker it sounds.

::diagram{name="unison"}

## Try this

Each experiment sets up the sound for you. Listen, then use A/B to compare with how it was before.

## The controls

- [Waveform](help:osc-a-waveform): the shape of the wave.
- [Octave](help:osc-a-octave), [Semitone](help:osc-a-semitone) and [Fine tune](help:osc-a-fine): tune the oscillator.
- [Pulse width](help:osc-a-pulse-width): the width of a pulse wave.
- [Sub oscillator](help:sub-waveform) and its [octave](help:sub-octave): a low layer that follows oscillator A.

## Beyond this synth

Synth Lab has two oscillators with fixed shapes. Other synths replace them with something richer. **Wavetable** oscillators (Serum, Vital) scan through a table of waveforms. **FM** synths such as the DX7 and Ableton's Operator let oscillators modulate each other's frequency. **Additive** synthesis builds a sound from individual sine harmonics. Others play samples, use granular playback of tiny slices of sound, model physical objects, or use the wavefolding oscillators of West Coast synthesis.

Better oscillators add **unison** (many detuned copies, spread across the stereo field), **hard sync**, ring modulation, warp modes, careful **anti-aliasing** and oversampling, a little analogue-style pitch drift, and simply more oscillators.

## Where you've heard it

Detuned sawtooths are the sound of trance and pop leads. Square waves are the hollow voice of old computer games. Sines make smooth bass and soft bell tones.

## Related

- [Mixer](help:mixer): how the oscillators are combined.
- [Filter](help:filter): shaping the harmonics.
- [Envelopes](help:envelopes): shaping how the sound changes over time.
