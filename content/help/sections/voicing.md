---
id: voicing
title: Voicing
kind: section
related: [envelopes, lfo, voice-mode, voice-glide]
presets: [plucked-bass, acid-squelch, vibrato-lead]
tryThis:
  - title: Mono bass with glide
    description: In mono mode only one note sounds, and the pitch slides between notes. Play two notes in turn.
    patch: { voice-mode: mono, voice-glide: 0.15 }
    note: 40
  - title: Smooth legato lead
    description: In legato mode, overlapped notes glide without restarting the envelope. Hold one key and press another.
    patch: { voice-mode: legato, voice-glide: 0.1, amp-env-attack: 0.1 }
    note: 64
  - title: Run out of voices
    description: Limit the synth to two voices and play a chord of four notes. The oldest notes are taken.
    patch: { voice-count: 2, amp-env-release: 1.5 }
    note: 60
---
## What it is

Voicing decides how notes become sounds. Each note you play uses one [voice](term:voice): its own oscillators, filter and envelopes. Voicing controls how many voices there are and how they behave when you play.

## What you'll hear

In poly mode you can play chords, and each note is independent. In mono mode you play one note at a time; the sound is more focused, and it is how basses and leads are usually played. [Legato](term:legato) joins notes without restarting the sound. [Glide](term:glide) slides the pitch from note to note.

## Try this

Each experiment changes how notes are handled. Play two or three keys and compare with A/B.

## The controls

- [Mode](help:voice-mode): poly, mono or legato.
- [Voices](help:voice-count): how many notes can sound at once.
- [Glide](help:voice-glide): the time to slide between notes.
- [Master tune](help:master-tune): the pitch of A4.

## Beyond this synth

When you play more notes than there are voices, a synth must choose which to cut. Better synths offer several **voice allocation** modes. **Paraphonic** synths send many notes through one shared filter and envelope, which gives a different, stuttering character. Some monosynths stack several oscillators as **unison** instead of using voices.

Expensive designs give every voice small random differences, as real analogue circuits have. **MPE** (MIDI Polyphonic Expression) lets each note bend and change on its own. Others support **microtuning** for scales other than twelve equal steps, and add **arpeggiators** and chord modes.

## Where you've heard it

Mono lead lines with glide are the sound of classic synth solos. Poly voicing is how piano-like parts and pads are played. Legato makes a lead sound like a single wind or string player.

## Related

- [Envelopes](help:envelopes): restarted by each note except in legato.
- [LFO](help:lfo): can restart with each note.
