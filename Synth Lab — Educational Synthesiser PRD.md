# Synth Lab — Educational Synthesiser PRD

Oct 10, 2026 · @Babak

## 1. Overview

Synth Lab is a browser-based subtractive synthesiser built to teach. Every section of the synth carries a help button that explains what it does, how to hear it, and how professional synths go further. A computer-keyboard player and a simple multi-track piano roll make it usable for real music, not just isolated tones.

### Problem

Modern synths such as Serum, Vital or a Prophet share the same core building blocks, but beginners meet them all at once, behind dense panels and jargon. Tutorials are separate from the instrument, so learners read about a filter in one place and turn knobs in another.

### Goals

1. Present a playable, configurable synth that contains the core building blocks of a modern subtractive synth, each in its simplest useful form.
2. Explain every element in place, through a help (?) button next to each section and each control.
3. Show learners how each simple component is extended or replaced in more sophisticated synths, so the app is a map of the wider field.
4. Make the synth usable for play and composition through a laptop-keyboard player and a track-based piano roll.
5. Give immediate audible and visual feedback for every change (scope, spectrum, envelope and filter plots).

### Non-goals (v1)

- Sound quality on par with commercial synths, or analog-modelled character.
- Wavetable, FM, granular, additive or sample-based synthesis engines (covered in help content only).
- A full DAW: no audio recording, mixing console, automation lanes or plugin hosting.
- MIDI file import/export and external MIDI hardware (candidates for v2).
- Accounts, cloud sync or social features.

### Target users

- **Curious beginners and hobbyists** who use presets but don't know what the knobs do.
- **Music production students** who need a sandbox alongside coursework.
- **Teachers** who want a free, zero-install tool to demonstrate concepts in class.

Assumed device: a laptop with a physical keyboard, running a recent Chrome, Edge, Safari or Firefox. Touch and mobile are secondary.

## 2. Product structure

The app is a single page with three stacked zones: the synth panel on top, the keyboard below it, and the composition tool at the bottom. A help drawer slides in from the right whenever a (?) is clicked, without hiding the controls it describes.

| Zone | Contents | Notes |
| --- | --- | --- |
| Top bar | App name, preset menu, master volume, audio on/off, tempo, help index | Audio starts on the first click (browser rule) |
| Synth panel | Oscillators, mixer, filter, envelopes, LFO, voicing, effects, visualisers | Laid out left to right in signal-flow order |
| Keyboard | On-screen keys, octave and velocity controls, held-note display | Mirrors laptop-keyboard input |
| Composition | Track list, piano roll grid, transport | Collapsible to give the synth more room |
| Help drawer | Content for the selected element | Opens beside, never over, the panel |

### Principles

- **Signal-flow layout.** Sections sit in the order sound travels through them, with thin connector lines between them, so the layout itself teaches the architecture.
- **Simple by default.** Each section shows its essential controls. Advanced controls (where v1 has any) sit behind a "more" toggle.
- **Everything is explainable.** Every section title and every control has a (?) button. No control ships without help content.
- **See what you hear.** Each section that shapes sound shows a small live plot of its effect.
- **Safe to experiment.** Every control has a reset (double-click), presets can be restored, and a limiter on the master output protects ears and speakers.

## 3. Synth engine

The engine is a polyphonic subtractive synth with six component groups: sound sources, filter, envelopes, LFO and modulation, voicing, and effects, plus a master section with visualisers. Each group is specified below in its simplest useful form.

&#91;embedded content: Synth Lab signal flow · per-voice chain, shared effects and master\]

Each note gets its own copy of the left-hand chain; all voices are summed before the shared effects and master section.

### 3.1 Oscillators and mixer

Two main oscillators (A and B), a sub oscillator and a noise source, each with its own level in a mixer. Oscillator B can be detuned against A to show beating and thickness.

| Control | Range | Default | Notes |
| --- | --- | --- | --- |
| Waveform (A, B) | Sine, triangle, sawtooth, square, pulse | A: saw, B: off | Icon buttons showing each shape |
| Octave (A, B) | −2 to +2 | 0 | Steps of 12 semitones |
| Semitone (A, B) | −12 to +12 | 0 |  |
| Fine tune (A, B) | −50 to +50 cents | 0 | Shows beating when A and B differ slightly |
| Pulse width (A, B) | 5% to 95% | 50% | Active only for pulse; 50% equals square |
| Sub oscillator | Off, sine or square; −1 or −2 octaves | Off | Follows oscillator A's pitch |
| Noise | White noise, level only | Off |  |
| Mixer levels | 0 to 100% per source | A 80%, others 0% | Summed before the filter |

Acceptance: changing waveform while a note is held changes the sound with no click; the scope shows the selected shape.

### 3.2 Filter

One multimode filter shared by all sources, per voice.

| Control | Range | Default | Notes |
| --- | --- | --- | --- |
| Type | Low-pass, high-pass, band-pass, notch | Low-pass | 12 dB/octave |
| Cutoff | 20 Hz to 20 kHz, logarithmic | 8 kHz |  |
| Resonance | 0 to \~20 (Q) | 1 | Capped to avoid painful self-oscillation |
| Envelope amount | −100% to +100% | 0% | How far the filter envelope moves the cutoff |
| Key tracking | 0%, 50%, 100% | 0% | Higher notes open the filter more |

A live frequency-response curve shows the filter shape and moves with modulation.

### 3.3 Envelopes

Two ADSR envelopes: the amp envelope (hardwired to volume) and the filter envelope (routed to cutoff via envelope amount).

| Control | Range | Default (amp) | Default (filter) |
| --- | --- | --- | --- |
| Attack | 1 ms to 5 s | 5 ms | 5 ms |
| Decay | 1 ms to 5 s | 200 ms | 300 ms |
| Sustain | 0 to 100% | 80% | 30% |
| Release | 1 ms to 10 s | 300 ms | 300 ms |
| Velocity sensitivity | 0 to 100% | 50% | 0% |

Each envelope draws its shape; a moving dot shows where each held note is in it.

### 3.4 LFO and modulation

One LFO with a single destination selector, the simplest form of a modulation system.

| Control | Range | Default | Notes |
| --- | --- | --- | --- |
| Shape | Sine, triangle, sawtooth, square, sample-and-hold | Sine |  |
| Rate | 0.05 to 20 Hz, or tempo-synced 1/1 to 1/32 | 4 Hz | Sync toggle |
| Depth | 0 to 100% | 0% |  |
| Destination | Pitch (vibrato), cutoff (wah), amp (tremolo), pulse width (PWM) | Cutoff | One at a time |
| Retrigger | On or off | Off | On restarts the LFO with each note |

Velocity is the only other fixed modulation route (to amp and filter envelopes, above). A full mod matrix is out of scope for v1 and covered in help content.

### 3.5 Voicing

| Control | Range | Default | Notes |
| --- | --- | --- | --- |
| Mode | Poly, mono, legato | Poly | Legato: overlapping notes glide without retriggering envelopes |
| Voices | 1 to 8 | 8 | When exceeded, the oldest note is stolen |
| Glide | 0 to 2 s | 0 | Applies in mono and legato |
| Master tune | 430 to 450 Hz (A4) | 440 Hz |  |

### 3.6 Effects

Three effects in a fixed order: distortion, then delay, then reverb. Each has an on/off switch and a dry/wet mix.

| Effect | Controls | Notes |
| --- | --- | --- |
| Distortion | Drive, tone, mix | Soft clipping (waveshaper) |
| Delay | Time (ms or tempo-synced), feedback (max 90%), mix | Ping-pong as a toggle |
| Reverb | Size (short, room, hall), mix | Convolution with three generated impulse responses |

### 3.7 Master and visualisers

- Master volume, with a brickwall limiter that cannot be disabled.
- Oscilloscope of the output, stabilised on the played note's period so waveforms stand still.
- Spectrum analyser, so learners see harmonics change with waveform and filter.
- Per-section plots: filter response, envelope shapes, LFO shape.
- Output meter with a clip indicator.

### 3.8 Presets

An **Init** preset (one saw, filter open, plain envelope) plus about 12 teaching presets, each built to demonstrate one idea: plucked bass (filter envelope), pad (slow attack and release), lead with vibrato (LFO to pitch), wobble (synced LFO to cutoff), PWM strings, detuned supersaw-style lead, organ (sine harmonics via octave layering), and so on. Users can save their own presets to local storage and export them as JSON.

## 4. Educational layer

Every section and control has a small (?) button that opens a help entry in the side drawer, and every entry ends with how the component is done differently or better in sophisticated synths. Help content is a first-class part of the product, written and reviewed like code.

### 4.1 Help (?) behaviour

- A (?) sits beside every section title (a long entry) and appears on hover or focus beside every control (a short entry).
- Clicking (?) opens the drawer at that entry; the controls it describes stay visible and playable, and are highlighted with an outline.
- The drawer remembers its scroll position per entry and has back/forward navigation between entries.
- Entries link to each other (for example, Filter links to Envelope via "envelope amount").
- Glossary terms (harmonic, Hz, cents, Q) are underlined; hovering shows a one-line definition.
- A **Help index** in the top bar lists every entry in signal-flow order, so the help also works as a course outline.
- Keyboard access: `?` opens help for the focused control, `Esc` closes the drawer. Note that while the keyboard player is active, `?` must not be mapped to a note.

### 4.2 Help entry template

Each section entry follows the same structure, so learners know where to look.

1. **What it is** — one or two plain sentences.
2. **What you'll hear** — what changes in the sound, with a small animated diagram (for example, a saw wave losing its upper harmonics as cutoff falls).
3. **Try this** — two or three short experiments. Each has a "Set it up" button that loads the needed settings and an "A/B" toggle to compare before and after.
4. **The controls** — one line per control, linking to the control's short entry.
5. **Beyond this synth** — alternatives to this component and how more sophisticated synths improve it (section 4.3).
6. **Where you've heard it** — genres or classic sounds that rely on it, described in words only (no copyrighted audio).
7. **Related** — links to neighbouring entries.

Control entries are shorter: what it does, its range in plain terms, and one tip. Target length: 150–400 words per section entry, 30–80 per control entry.

### 4.3 "Beyond this synth" content by component

This table sets the minimum content each section's "Beyond this synth" part must cover.

| Component | In Synth Lab | Alternatives | How sophisticated synths improve it |
| --- | --- | --- | --- |
| Oscillators | Two oscillators with fixed basic waveforms | Wavetable (Serum, Vital), FM (DX7, Operator), additive, sample and multisample, granular, physical modelling, West Coast complex oscillators with wavefolding | Unison with detune and stereo spread, hard sync, ring and FM between oscillators, warp modes, anti-aliasing and oversampling, analog-style pitch drift, more oscillators |
| Mixer | Level per source, summed into one filter | Per-source routing to different filters (Serum's per-oscillator filter switches) | Pre-filter drive and saturation, serial or parallel dual-filter routing |
| Filter | One 12 dB/oct multimode filter | Moog ladder, Oberheim SEM state-variable, Roland diode/303, Korg MS-20, comb, formant, phaser-style filters | 24 dB slopes, morphable slopes and types, drive and self-oscillation, zero-delay-feedback analog modelling, two filters in series or parallel |
| Envelopes | Two fixed ADSRs | Multi-stage envelopes (DAHDSR), drawable multi-segment envelopes (MSEGs in Vital, Phase Plant) | Adjustable curves, looping envelopes, more envelopes assignable to any parameter |
| LFO and modulation | One LFO, one destination | Mod matrix, drag-and-drop modulation, modular patching (Bitwig Grid, Eurorack) | Several LFOs with drawable shapes, audio-rate modulation, per-voice vs global LFOs, macros, modulating modulation depth, MPE sources |
| Voicing | Poly/mono/legato, glide, 8 voices | Paraphonic synths, unison-stacked monosynths | Voice allocation modes, per-voice analog variation, MPE, microtuning, arpeggiators and chord modes |
| Effects | Distortion, delay, reverb in fixed order | Chorus (central to the Juno sound), phaser, flanger, compressor, EQ, bit crusher | Reorderable chains, per-voice effects, tape- and analog-modelled delays, algorithmic and shimmer reverbs |
| Master and visualisers | Volume, limiter, scope, spectrum | Hardware synths with no display at all | Oversampling and quality settings, modulation visualisation on every knob |
| Keyboard | Laptop keys, fixed velocity per row or slider | MIDI keyboards, pads, wind controllers, MPE surfaces (Seaboard, Osmose) | Aftertouch, mod and pitch wheels, per-note expression |
| Composition | Simple multi-track piano roll | Step sequencers, trackers, DAW piano rolls | Velocity and automation lanes, quantise and groove, MIDI export |

### 4.4 Content requirements

- Content lives in separate Markdown files with front-matter (`id`, `title`, `related`, `presets`), keyed to control ids, so it can be edited without touching code.
- A build check fails if any control lacks a help entry, or any entry links to a missing id.
- Plain British English, no unexplained jargon, readable by a motivated 14-year-old.
- Named commercial synths are mentioned factually as examples; no logos, screenshots or audio from them.
- Technical accuracy is reviewed by someone with synth design experience before launch.

## 5. Keyboard

The laptop keyboard plays about 2.5 octaves at once by using all four letter and number rows as two piano manuals, the layout trackers have used for decades. Octave shifting extends the reachable range to the full piano, C0 to C8.

### 5.1 Key mapping

| Manual | White keys | Black keys | Range at default octave |
| --- | --- | --- | --- |
| Lower | Z X C V B N M , . / | S D G H J L ; | C3 to E4 (17 notes) |
| Upper | Q W E R T Y U I O P \[ \] | 2 3 5 6 7 9 0 = | C4 to G5 (20 notes) |

The manuals overlap by an octave (C4 to E4), so either hand position can play the middle range. Black keys sit physically between the white keys they belong to, matching a real piano.

### 5.2 Controls

| Action | Key | Notes |
| --- | --- | --- |
| Octave down / up | ← / → | Shifts both manuals; range clamped to C0–C8 |
| Velocity down / up | ↓ / ↑ | Steps of 16 (1–127); also a slider on screen |
| Sustain | Hold Shift | Like a sustain pedal |
| All notes off | Esc | Panic button, also on screen |

### 5.3 Requirements

- Map by physical key position (`KeyboardEvent.code`), so the layout works on QWERTY, AZERTY and QWERTZ keyboards.
- Ignore key auto-repeat; a held key is one note.
- Notes play only when focus is not in a text field; a small indicator shows when the keyboard is "live".
- An on-screen 61-key keyboard (scrollable to 88) mirrors input: pressed keys light up, keys are labelled with their laptop key, and mouse or touch can play them.
- Played note names (for example C4, F#3) display above the keyboard, which supports the help content on pitch.
- Help entry explains that laptops can only register a few keys at once (key ghosting), so some chords will not sound.
- Recording: when a track is armed in the composition tool, keyboard input is recorded into it (section 6).
- Web MIDI input from a hardware keyboard is a v1.1 stretch goal, where browsers support it.

## 6. Composition tool

The composition tool is a small multi-track sequencer: each track has its own synth patch, and notes are drawn on a piano-roll grid with any length the grid allows. Selecting a track loads its patch into the synth panel, so learners can shape the sound of a bass line while it loops.

### 6.1 Project

| Setting | Range | Default |
| --- | --- | --- |
| Tempo | 40 to 240 BPM | 120 |
| Time signature | 3/4, 4/4, 6/8 | 4/4 |
| Length | 1 to 64 bars | 8 |
| Loop region | Any bar range within the length | Whole project |

### 6.2 Tracks

- Up to 8 tracks. Each track is an independent synth instance with its own preset.
- Track header: name, colour, preset selector, volume, mute, solo, record arm, and "edit sound" (focuses the synth panel on this track).
- The track list shows a miniature of each track's notes along a shared timeline, so the whole arrangement is visible at once.
- Add, duplicate, reorder (drag) and delete tracks.

### 6.3 Piano roll

The piano roll edits the selected track: pitch on the vertical axis (a piano along the left edge), time on the horizontal axis in bars and beats.

- **Add:** click an empty cell to place a note of the current length; click and drag to draw a note of any length.
- **Length presets:** buttons for whole, half, quarter, eighth, sixteenth and thirty-second notes, plus dotted and triplet toggles.
- **Grid snap:** 1/1 to 1/32, triplet grids, or off (free placement); hold Alt to bypass snap temporarily.
- **Edit:** drag to move, drag the right edge to resize, select by click or box, delete with Backspace, duplicate with Cmd/Ctrl+D, copy and paste, transpose selection with arrow keys.
- **Velocity:** a velocity lane under the grid with one bar per note; selected notes can be scaled together.
- **Audition:** clicking a piano key on the left plays that pitch; placing a note plays it briefly.
- **Ghost notes:** other tracks' notes can be shown faintly, to help line up parts.
- **Zoom:** horizontal and vertical, plus "fit to notes".
- **Undo/redo** for all edits (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z).

### 6.4 Transport and recording

- Play/stop (Space), return to start (Home), loop toggle, a moving playhead that follows playback.
- Metronome on/off with a one-bar count-in for recording.
- Recording from the laptop keyboard into the armed track, with optional quantise on input (off, 1/8, 1/16).
- Notes play at sample-accurate times regardless of UI load (section 7).

### 6.5 Saving

- Autosave the current project to browser storage; restore it on reload.
- Save, open and export projects as JSON files, including each track's patch.
- Export to WAV via offline rendering is a v1.1 goal; MIDI file export is v2.

## 7. Technical approach

Synth Lab is a static web app written in TypeScript on the Web Audio API, which runs audio processing natively on its own thread and comfortably handles this synth's load. A native macOS build is not needed for v1; the web app can later be wrapped with Tauri if a desktop version is wanted.

### 7.1 Stack

- TypeScript, Vite, and a component UI framework (React or Svelte).
- Canvas for the piano roll and visualisers; SVG or DOM for knobs and panels.
- Static hosting; installable as a progressive web app that works offline after the first load.

### 7.2 Mapping components to Web Audio

| Component | Implementation |
| --- | --- |
| Sine, triangle, saw, square | `OscillatorNode` |
| Pulse with modulatable width | Small `AudioWorklet` oscillator (PolyBLEP anti-aliasing), so the LFO can drive PWM |
| Sub oscillator | `OscillatorNode` one or two octaves down |
| Noise | Looping `AudioBufferSourceNode` of white noise |
| Mixer and amp | `GainNode` per source and per voice |
| Filter | `BiquadFilterNode`; envelope and LFO drive its `detune` parameter so modulation is exponential (musical) |
| Envelopes | Scheduled `AudioParam` automation (`setTargetAtTime`, `linearRampToValueAtTime`) |
| LFO | `OscillatorNode` → depth `GainNode` → target `AudioParam`; sample-and-hold via a stepped `PeriodicWave` or worklet |
| Distortion, delay, reverb | `WaveShaperNode`; `DelayNode` with feedback `GainNode`; `ConvolverNode` with generated impulses |
| Limiter | `DynamicsCompressorNode` set to a high ratio and fast attack |
| Scope, spectrum, meter | `AnalyserNode` read each animation frame |

### 7.3 Software architecture

- **Patch model:** each track's sound is a plain JSON object. The UI edits the model; the engine subscribes to it. The UI never touches audio nodes directly.
- **Engine:** one synth instance per track, creating a voice (a small node graph) per note and disposing of it after release.
- **Sequencer:** a lookahead scheduler (about every 25 ms, scheduling 100 ms ahead) places notes on the audio clock, so timing stays tight even when the UI is busy.
- **Help module:** loads Markdown entries by control id and renders them in the drawer; the content build check runs in CI.

### 7.4 Non-functional requirements

| Area | Requirement |
| --- | --- |
| Latency | Key press to sound under 30 ms on target hardware (`latencyHint: "interactive"`) |
| Capacity | 8 tracks × 8 voices with all effects on, no dropouts, on a 2020 MacBook Air (M1) or equivalent |
| Timing | Sequencer notes start within 1 ms of their scheduled time |
| Smoothness | No clicks or zipper noise on any control change; parameters smoothed over 5–20 ms |
| UI | 60 fps while playing, including visualisers |
| Browsers | Latest two versions of Chrome, Edge, Safari and Firefox |
| Load | Under 2 MB transferred and under 3 s to interactive on broadband |
| Hearing safety | Output limiter always on; starts at −12 dB master volume |
| Accessibility | Every control usable by keyboard, labelled for screen readers with its value; WCAG 2.2 AA contrast; animation respects reduced-motion settings |
| Privacy | No accounts; projects and presets stored locally; no third-party tracking |

## 8. Delivery

### 8.1 Milestones

The build runs in six stages, each ending in something playable. No dates are set yet.

1. **Sound engine:** one oscillator, filter and amp envelope playable from the laptop keyboard. Exit: polyphonic notes with no clicks; latency target met.
2. **Full synth panel:** all components in section 3, presets, and visualisers. Exit: every control works and is smoothed; capacity target met for one track.
3. **Keyboard:** full mapping, octave and velocity controls, on-screen keyboard. Exit: works on QWERTY, AZERTY and QWERTZ layouts.
4. **Educational layer:** help drawer, template, every entry written and reviewed, "Try this" buttons. Exit: content build check passes; expert review done.
5. **Composition tool:** tracks, piano roll, transport, recording, saving. Exit: an 8-track, 16-bar loop plays with no timing drift or dropouts.
6. **Beta and polish:** accessibility pass, browser testing, usability sessions. Exit: success measures below met.

### 8.2 Success measures

Measured in moderated sessions with 8–10 beginners, plus optional, anonymous, first-party usage counts.

- After 20 minutes, at least 80% of beginners can explain in their own words what the filter, envelope and LFO do.
- At least 70% of sessions open three or more help entries.
- At least 70% of beginners can program a given sound (for example, a plucked bass) from Init without help from the facilitator.
- At least 60% can make an 8-bar loop with two tracks in under 15 minutes.

### 8.3 Open questions

- [ ] Name: is "Synth Lab" a working title or final?
- [ ] Should v1 include guided lessons (a sequence of "Try this" steps), or only reference-style help?
- [ ] Is a hardware MIDI keyboard (Web MIDI) needed in v1 for classroom use?
- [ ] Should a chorus effect join v1, given how central it is to classic polysynth sounds?
- [ ] Who writes and who technically reviews the help content?
- [ ] Free and open source, or a paid product? This affects hosting, analytics and content licensing.
