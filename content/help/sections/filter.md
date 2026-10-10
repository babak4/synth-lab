---
id: filter
title: Filter
kind: section
related: [oscillators, envelopes, lfo, filter-cutoff, filter-resonance, filter-type, filter-env-amount]
presets: [plucked-bass, acid-squelch, wind-sweep, wobble-bass]
tryThis:
  - title: Close the filter
    description: Hold a note and hear the buzz fade as the cutoff drops. The upper harmonics are being removed.
    patch: { filter-cutoff: 500 }
    note: 45
  - title: Add resonance
    description: A high resonance makes the filter ring at its cutoff. Hold a note and listen for the whistle.
    patch: { filter-cutoff: 900, filter-resonance: 12 }
    note: 45
  - title: Let an envelope open it
    description: The filter envelope opens the filter on each note, then closes it again. This makes a pluck.
    patch: { filter-cutoff: 200, filter-env-amount: 0.8, filter-env-decay: 0.3, filter-env-sustain: 0 }
    note: 40
---
## What it is

A [filter](term:filter) removes some of the frequencies in a sound and keeps others. It is the main tool in subtractive synthesis: you start with a bright sound full of harmonics and carve away what you do not want.

## What you'll hear

On a [low-pass](term:low-pass) filter, turning the [cutoff](term:cutoff) down takes the high [harmonics](term:harmonic) away one by one and the sound gets darker and rounder. [Resonance](term:resonance) boosts the frequencies at the cutoff, so a moving filter seems to sing. A [high-pass](term:high-pass) filter thins the sound instead, and a [band-pass](term:band-pass) filter keeps a narrow slice.

::diagram{name="filter-sweep"}

## Try this

Each experiment shows one thing a filter can do. Use A/B to compare.

## The controls

- [Type](help:filter-type): low-pass, high-pass, band-pass or notch.
- [Cutoff](help:filter-cutoff): where the filter starts to act.
- [Resonance](help:filter-resonance): the boost at the cutoff.
- [Envelope amount](help:filter-env-amount): how far the filter envelope moves the cutoff.
- [Key tracking](help:filter-key-tracking): whether high notes open the filter more.

## Beyond this synth

This filter has a gentle 12 dB per octave [slope](term:slope). Many classic synths use steeper ones. The **Moog** ladder filter has a 24 dB slope and can reach **self-oscillation**, where it whistles on its own. The Oberheim SEM uses a **state-variable** design that can blend between filter types. Roland's TB-303 uses a diode ladder, and the Korg MS-20 pairs a high-pass and a low-pass filter. Others use comb, formant or phaser-style filters.

Modern synths add morphable slopes and types, a **drive** stage inside the filter, careful digital modelling of analogue circuits, and two filters in series or parallel.

## Where you've heard it

Filter sweeps are everywhere in dance music, where a sound opens up over a build. The squelchy bass of acid house is a resonant filter with an envelope. The "wah" of a guitar pedal is a band-pass filter moved by a foot.

## Related

- [Envelopes](help:envelopes): the filter envelope.
- [LFO](help:lfo): sweep the cutoff automatically.
- [Oscillators](help:oscillators): the harmonics the filter works on.
