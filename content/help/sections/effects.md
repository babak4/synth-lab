---
id: effects
title: Effects
kind: section
related: [master, filter, dist-drive, delay-feedback, reverb-size]
presets: [wobble-bass, ping-pong-pluck, warm-pad, supersaw-lead]
tryThis:
  - title: Add grit
    description: Distortion adds harmonics and a rougher edge. Hold a low note and listen to the sound become fuller and fiercer.
    patch: { dist-on: true, dist-drive: 20, dist-mix: 0.6 }
    note: 45
  - title: Add echoes
    description: The delay repeats the note, fading away. Play a short note and wait.
    patch: { delay-on: true, delay-time: 0.35, delay-feedback: 0.5, delay-mix: 0.4 }
    note: 64
  - title: Put it in a hall
    description: The hall reverb surrounds the note in a long, smooth tail. Play a short note and listen to it fade.
    patch: { reverb-on: true, reverb-size: hall, reverb-mix: 0.45 }
    note: 64
---
## What it is

Effects change the sound after it leaves the voices. Synth Lab has three, always in the same order: [distortion](term:distortion), then [delay](term:delay), then [reverb](term:reverb). Each has an on switch and a [dry and wet](term:dry-wet) mix.

## What you'll hear

Distortion flattens the peaks of the wave, which adds harmonics and makes the sound rougher. Delay repeats the sound after a short time, and [feedback](term:feedback) makes the repeats go on. Reverb adds the sound of a space, using [convolution](term:convolution) with generated impulses for a short room, a room and a hall. Because of the order, the delay repeats the distorted sound, and the reverb surrounds the echoes.

## Try this

Each experiment switches on one effect. Compare with A/B.

## The controls

- [Distortion](help:dist-on): [drive](help:dist-drive), [tone](help:dist-tone) and [mix](help:dist-mix).
- [Delay](help:delay-on): [time](help:delay-time), [sync](help:delay-sync), [feedback](help:delay-feedback), [ping-pong](help:delay-pingpong) and [mix](help:delay-mix).
- [Reverb](help:reverb-on): [size](help:reverb-size) and [mix](help:reverb-mix).

## Beyond this synth

Many classic sounds depend on effects not found here. **Chorus**, which thickens a sound by mixing it with slightly delayed, wobbling copies, is central to the sound of the Roland Juno synths. Others include the **phaser**, the flanger, a **compressor**, equalisation and a bit crusher.

Better synths let you **reorder** the chain, put effects on each voice, model tape and analogue delays, and offer algorithmic and shimmer reverbs as well as convolution.

## Where you've heard it

Distortion is the roar of a rock guitar and the bite of an acid bass. Echo is the trailing repeats on a vocal. Reverb is the sound of a church, a hall, a bathroom.

## Related

- [Master](help:master): the output the effects feed.
- [Filter](help:filter): shape the sound before the effects.
