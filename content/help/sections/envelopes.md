---
id: envelopes
title: Envelopes
kind: section
related: [filter, lfo, amp-env-attack, amp-env-release, filter-env-amount]
presets: [plucked-bass, warm-pad, tremolo-keys]
tryThis:
  - title: Make a pad
    description: A slow attack and a long release let the sound swell in and fade out. Press and hold a chord.
    patch: { amp-env-attack: 0.8, amp-env-release: 1.6, filter-cutoff: 2500 }
    note: 60
  - title: Make a pluck
    description: No sustain and a short decay make each note die away by itself, even when you hold the key.
    patch: { amp-env-attack: 0.002, amp-env-decay: 0.25, amp-env-sustain: 0, amp-env-release: 0.2 }
    note: 64
  - title: Make the filter pluck too
    description: The filter envelope opens the filter on each note then closes it again, so the sound starts bright and gets dark.
    patch: { filter-cutoff: 250, filter-env-amount: 0.8, filter-env-decay: 0.25, filter-env-sustain: 0 }
    note: 48
---
## What it is

An [envelope](term:envelope) is a shape that unfolds over the life of one note. Synth Lab has two [ADSR](term:adsr) envelopes. The amp envelope controls volume. The filter envelope moves the filter's cutoff.

## What you'll hear

When you press a key the envelope starts. [Attack](term:attack) is how long the sound takes to reach its peak. [Decay](term:decay) is how long it takes to fall to the [sustain](term:sustain) level, which it holds while the key is down. When you let go, [release](term:release) is how long it takes to fade. Short attack and decay give plucks. Long attack and release give pads.

::diagram{name="adsr"}

## Try this

Each experiment sets the envelope for a different kind of sound. Compare with A/B.

## The controls

- [Attack](help:amp-env-attack), [Decay](help:amp-env-decay), [Sustain](help:amp-env-sustain) and [Release](help:amp-env-release): the four stages.
- [Velocity](help:amp-env-velocity): how much key force changes the level.
- The filter envelope has the same five controls; its [amount](help:filter-env-amount) is set in the filter section.

## Beyond this synth

Synth Lab has two fixed ADSR envelopes. Many synths add a **delay** and **hold** stage (DAHDSR), or offer **multi-stage** envelopes with as many points as you like. Drawable envelopes, called **MSEGs** (multi-stage envelope generators) in Phase Plant, let you draw any shape; in Vital the same idea is a drawable LFO that runs once. Others add adjustable **curves** for each stage, and envelopes that **loop**, which turns them into a kind of LFO.

Bigger synths also offer more envelopes that can be assigned to any parameter, not only the volume and the filter.

## Where you've heard it

A piano is a pluck: loud at first and then fading, even with the key held. A string section or a pad has a slow attack. An organ switches on and off at once, with almost no envelope at all.

## Related

- [Filter](help:filter): what the filter envelope moves.
- [LFO](help:lfo): a repeating alternative to an envelope.
