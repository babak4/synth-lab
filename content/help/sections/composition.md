---
id: composition
title: Composition
kind: section
related: [keyboard, voicing, envelopes]
presets: []
tryThis:
  - title: Set up a bass sound
    description: Make a short, punchy bass to use for the lowest track of a loop.
    patch: { voice-mode: mono, filter-cutoff: 300, filter-env-amount: 0.5, filter-env-decay: 0.2, filter-env-sustain: 0 }
    note: 36
  - title: Set up a pad
    description: Make a slow, soft sound for a second track that holds chords.
    patch: { amp-env-attack: 0.6, amp-env-release: 1.2, reverb-on: true, reverb-mix: 0.3 }
    note: 60
---
## What it is

The composition tool is a small multi-track sequencer. Each track has its own synth sound, and you draw notes on a grid called the piano roll. The notes play back at the project's [tempo](term:tempo), and you can [loop](term:loop) a section.

## What you'll hear

Pick a track and its sound loads into the synth panel, so you can change a bass line's sound while it plays. Click an empty cell to add a note, drag to make it longer, and drag a note to move it. Snap keeps notes on the beat; hold Alt to place a note between snap lines. The velocity lane sets how hard each note is played.

## Try this

Each experiment sets up a sound for a track. Compare with A/B.

## The controls

- Tempo: from 40 to 240 beats per minute.
- Tracks: up to eight, each with a name, colour, volume, mute and solo.
- Piano roll: add, move, resize, select, copy and delete notes. Undo with Command or Control and Z.
- Record: play from the keyboard into the armed track.

## Beyond this synth

This piano roll is deliberately simple. **Step sequencers**, such as those on classic drum machines, place sounds on a grid of equal steps. Trackers write music as columns of numbers. DAW piano rolls add **automation** lanes that draw how a knob moves over time, **quantise** and groove tools that tidy or loosen timing, and **MIDI export** to move your music into other software.

## Where you've heard it

Almost all electronic music is made on a grid like this one. Step sequencers drive the repeating patterns of house and techno.

## Related

- [Keyboard](help:keyboard): record from your computer keys.
- [Voicing](help:voicing): mono lines suit bass tracks.
