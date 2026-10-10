---
id: mixer
title: Mixer
kind: section
related: [oscillators, filter, mix-osc-a, mix-noise]
presets: [organ, wind-sweep]
tryThis:
  - title: Add weight with the sub
    description: Bring in the sub-oscillator one octave below. The sound gets heavier without getting brighter.
    patch: { sub-waveform: sine, sub-octave: -1, mix-sub: 0.7 }
    note: 45
  - title: Layer an octave
    description: Add oscillator B an octave higher at a lower level. Notice how the extra harmonics make the sound fuller.
    patch: { osc-b-waveform: sawtooth, osc-b-octave: 1, mix-osc-b: 0.45 }
    note: 53
  - title: Add some air with noise
    description: A little noise adds breath and grit. Raise it high to turn the note into a hiss.
    patch: { mix-noise: 0.3, filter-cutoff: 3500 }
    note: 60
---
## What it is

The mixer sets how loud each sound source is. Oscillator A, oscillator B, the sub-oscillator and the noise each have a fader, and the results are added together and sent to the [filter](help:filter).

## What you'll hear

Because the sources are added together, the mixer is where you choose the character of the raw sound. A [sine](term:sine) layered an [octave](term:octave) up adds a new [harmonic](term:harmonic). Noise adds a hiss with no pitch. The sub adds low weight. Several sources at full level also make the total louder, so lower some of them to keep the sound clean.

## Try this

Each experiment changes the mix. Use A/B to hear the sound before and after.

## The controls

- [Oscillator A level](help:mix-osc-a): starts at 80%.
- [Oscillator B level](help:mix-osc-b): starts at 0%.
- [Sub level](help:mix-sub): starts at 0%.
- [Noise level](help:mix-noise): starts at 0%.

## Beyond this synth

In Synth Lab every source goes into one filter. Bigger synths give you choices. Serum lets each oscillator choose whether to pass through the filter, so one can stay bright while another is filtered. Many synths have a **drive** or saturation stage before the filter that adds warmth as sources are turned up. Others offer two filters, in series (one after the other) or in parallel (side by side), with the mixer deciding how the sources split between them.

## Where you've heard it

Organs are built like this: layers of sine waves at different octaves, each with its own level. The hiss in wind and breath sounds is a noise source on its own.

## Related

- [Oscillators](help:oscillators): the sources being mixed.
- [Filter](help:filter): where the mix is sent.
