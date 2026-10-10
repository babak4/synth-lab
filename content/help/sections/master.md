---
id: master
title: Master and visualisers
kind: section
related: [effects, filter, master-volume, oscillators]
presets: []
tryThis:
  - title: Watch the harmonics
    description: A sawtooth with the filter wide open has a rich, falling set of peaks in the spectrum. Hold a note and watch.
    patch: { osc-a-waveform: sawtooth, filter-cutoff: 20000 }
    note: 45
  - title: Watch them disappear
    description: Now close the filter. The upper peaks fall away and the scope trace turns smooth.
    patch: { osc-a-waveform: sawtooth, filter-cutoff: 400 }
    note: 45
---
## What it is

The master section is the last stop before your speakers. It has the master volume, a [limiter](term:limiter) that cannot be switched off, and three displays that show what the sound is doing.

## What you'll hear

The master volume starts at a safe −12 dB. The limiter stops sudden peaks from getting too loud, and the clip light comes on if the output ever reaches full scale. The scope shows the [waveform](term:waveform), held still on the note's period. The [spectrum](term:spectrum) shows which [harmonics](term:harmonic) are present on a scale of notes. The meter shows the overall level.

## Try this

Each experiment changes the sound so that you can watch it change.

## The controls

- [Master volume](help:master-volume): the overall level, from −60 dB to 0 dB.
- Oscilloscope, spectrum analyser and level meter: displays only, no controls.

## Beyond this synth

Many synths have quality settings, such as **oversampling**, which trades computer power for fewer digital artefacts such as [aliasing](term:aliasing). Modern synths also show the modulation on every knob, with a moving ring around it. Many hardware synths have no display at all, so you learn by listening.

## Where you've heard it

An oscilloscope trace of a synth is the image people picture for electronic music. Spectrum displays are common in mixing and mastering.

## Related

- [Effects](help:effects): processed before the master.
- [Filter](help:filter): moves the harmonics you see.
