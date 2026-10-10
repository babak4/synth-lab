# Help content: technical accuracy review (T4.6)

**Status: author self-review done. Independent review and human synth-design sign-off are still required.**
The plan asks for a reviewer who did not write the content (a fresh-context agent) and then a human expert.
This pass was done by the same agent that wrote the entries, so it is a checklist pass, not the independent
review. Nothing here should be read as sign-off.

## What was checked, entry by entry

Every numeric claim in a control entry was compared with `src/core/params/registry.ts` (ranges, defaults,
units) and with the engine behaviour it describes:

| Claim | Source of truth | Result |
| --- | --- | --- |
| Ranges and defaults of all 59 controls | registry | match |
| Filter envelope at +100% sweeps six octaves | `FILTER_ENV_CENTS` (7200 cents) | match |
| LFO depth 100% = ±2 semitones on pitch | `LFO_SCALE.pitch` (200 cents) | match |
| Key tracking 100% = one octave per octave above middle C | `Voice.keyTrackCents` (pivot MIDI 60) | match |
| Delay feedback capped at 90% | registry max and the delay worklet | match |
| 12 dB per octave filter slope | RBJ biquad (verified against the browser node) | match |
| Voice stealing takes releasing notes first | `VoiceAllocator.stealOne` | match |
| Reverb sizes (short 0.45 s, room 1.3 s, hall 3.0 s) | `IMPULSE_SPECS` | **fixed**: "room" had said "about a second and a half" |
| Harmonic amplitudes: saw 1/n, square odd 1/n, triangle odd 1/n² | `diagrams.ts`, unit-tested | match |
| Master volume starts at −12 dB; every 6 dB ≈ doubling | registry; arithmetic | match |

Claims about named commercial synths (checked for factual accuracy and kept deliberately modest):

- Wavetable: Serum, Vital. FM: DX7, Ableton Operator. Ladder filter: Moog (24 dB/oct). State-variable:
  Oberheim SEM. Diode ladder: Roland TB-303. Series high-pass + low-pass: Korg MS-20. Chorus central to
  the Roland Juno sound. MPE surfaces: Seaboard, Osmose. Per-oscillator filter routing: Serum.
- **Fixed:** the PRD lists "MSEGs in Vital, Phase Plant". Phase Plant has MSEGs; Vital's equivalent is a
  drawable LFO that can run once. The envelopes entry now says exactly that.
- Kept vague on purpose: "paraphonic synths" are described by mechanism only (one shared filter and
  envelope) and no product is named, because the examples I could name were not certain enough.

Style rules are enforced mechanically by `npm run content` (British spellings, no external links, template
headings, PRD §4.3 minimum "Beyond this synth" coverage per section, "Try this" patches validated against
the registry). Reading level is reported as a warning; no entry currently exceeds grade 9.

## Known gaps for the independent reviewer

1. **The Composition entry describes the planned piano roll, recording and undo, which do not exist yet**
   (Phase 5). It must be re-checked against the real behaviour when those land.
2. "Where you've heard it" lines are generic genre and instrument descriptions, with no specific
   recordings, as the PRD requires. A human should check they are fair.
3. The "Try this" experiments were verified to *apply* correctly (values in range, tests for Set it up,
   A/B and Undo) but nobody has *listened* to each to confirm it demonstrates what its text says. The
   factory presets have the same gap; their concepts are verified by measurement, not by ear.
4. Glossary terms linked from no entry (fundamental, triangle, detune, decibel, polyphony, clipping,
   quantise, midi, portamento) are reported as warnings; either link them or drop them.
5. A human expert should confirm that the simplifications are not misleading, in particular: "12 dB per
   octave", the "odd harmonics only" descriptions, and the explanation of resonance as a boost at the cutoff.
