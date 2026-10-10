---
id: lfo
title: LFO and modulation
kind: section
related: [filter, envelopes, voicing, lfo-destination, lfo-sync]
presets: [vibrato-lead, wobble-bass, tremolo-keys, pwm-strings]
tryThis:
  - title: Add vibrato
    description: Aim the LFO at pitch with a small depth. The note wavers gently, about five times a second.
    patch: { lfo-destination: pitch, lfo-depth: 0.15, lfo-rate: 5.5, lfo-shape: sine }
    note: 64
  - title: Add tremolo
    description: Aim the LFO at the amp instead. The volume now swells and fades rhythmically.
    patch: { lfo-destination: amp, lfo-depth: 0.6, lfo-rate: 6, lfo-shape: sine }
    note: 64
  - title: Make it wobble in time
    description: Sync the LFO to the tempo and aim it at a low cutoff. The sweep locks to the beat.
    patch: { lfo-destination: cutoff, lfo-depth: 0.5, lfo-sync: true, lfo-division: 1/8, filter-cutoff: 400, filter-resonance: 6 }
    note: 40
---
## What it is

An [LFO](term:lfo) is a slow oscillator that you do not hear directly. Instead it moves another setting up and down. This is [modulation](term:modulation): changing a setting automatically over time.

## What you'll hear

Aim the LFO at pitch and you get [vibrato](term:vibrato). Aim it at the filter cutoff and you get a "wah" or wobble. Aim it at volume and you get [tremolo](term:tremolo). Aim it at pulse width and a pulse wave seems to move. The [shape](help:lfo-shape) sets how it moves, and the [rate](help:lfo-rate) sets how fast.

::diagram{name="lfo-target"}

## Try this

Each experiment points the LFO at a different destination. Compare with A/B.

## The controls

- [Shape](help:lfo-shape): the pattern of the movement.
- [Rate](help:lfo-rate) or [Division](help:lfo-division): the speed, free or locked to the tempo with [Sync](help:lfo-sync).
- [Depth](help:lfo-depth): how far it moves the destination.
- [Destination](help:lfo-destination): what it moves.
- [Retrigger](help:lfo-retrigger): restart with each note.

## Beyond this synth

Synth Lab has one LFO with one destination at a time. Larger synths use a **mod matrix**, a table that connects any source to any destination, or let you drag a modulator onto a knob. Modular systems such as Bitwig's Grid and Eurorack let you patch anything into anything.

Better synths give you several LFOs with drawable shapes, modulation at **audio-rate** (so the LFO becomes part of the tone), a choice between per-voice and global LFOs, **macros** (one knob moving many things), modulation of the modulation depth itself, and expressive sources such as MPE.

## Where you've heard it

Vibrato is how a singer or a violinist holds a long note. A tremolo is the shimmer on an old electric piano. The wobble bass of dubstep is an LFO on a filter.

## Related

- [Filter](help:filter): a common LFO destination.
- [Envelopes](help:envelopes): one-shot modulation for each note.
- [Voicing](help:voicing): free-running or per-note LFOs.
