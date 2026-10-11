# Synth Lab

Synth Lab is a browser-based subtractive synthesiser built to teach. Every section of the synth has a help button that explains what it does, how to hear it, and how professional synths go further. You play it with your computer keyboard, and a composition tool lets you record or draw multi-track loops.

It is a static web app with no accounts, no cloud sync and no third-party tracking. Projects and presets are stored in your browser.

## Who it is for

- Beginners and hobbyists who use presets but don't know what the knobs do.
- Music production students who want a sandbox next to their coursework.
- Teachers who want a free, zero-install tool to demonstrate synthesis in class.

## Using it

Open the app in a recent Chrome, Edge, Firefox or Safari. Click **Start audio** (or press any note key); browsers only allow sound after a user action.

**The layout** fits one screen without scrolling. The top bar, the keyboard, and an output strip with the oscilloscope, spectrum analyser and level meter are always in view. The controls sit in tabs: **Sound**, **Shape**, **Modulation**, **Effects** and **Composition**. Each tab is laid out in signal-flow order, so the sound travels left to right:

- **Oscillators and mixer:** two oscillators, a sub-oscillator and noise.
- **Filter:** a multimode filter with cutoff, resonance, envelope amount and key tracking. A live response curve shows its shape.
- **Envelopes:** an amp envelope and a filter envelope, each with a moving dot that follows held notes.
- **LFO:** one modulation source aimed at pitch, cutoff, amplitude or pulse width, optionally synced to the tempo.
- **Voicing:** poly, mono or legato, with voice count and glide.
- **Effects:** distortion, delay and reverb, in that fixed order.
- **Master:** volume in the top bar, with the oscilloscope, spectrum analyser and level meter pinned beside the keyboard.

**Typing values.** Click the number under any knob or slider, or focus the control and press `Enter`, then type a value such as `2.5k`, `300 ms`, `35` or `-6 dB` and press `Enter`. `Esc` cancels.

**Undo.** The top-bar arrows and `Ctrl/Cmd+Z` undo sound edits and note edits in order; `Shift+Ctrl/Cmd+Z` redoes.

**Help.** Click any **?** button to open the help drawer beside the panel (the controls stay visible and playable). The drawer has back and forward navigation, glossary terms with tooltips, and "Try this" experiments with **Set it up**, **A/B** and **Undo**. Press `?` with a control focused for its help, or use **Help** in the top bar for the full index. Press `Esc` to close the drawer.

**Composition.** The Composition tab holds up to 8 tracks, each with its own sound. Click a track to edit its sound in the other tabs. Each row has a volume fader, mute and solo, and a miniature of its notes across the song. Below it the piano roll edits the selected track: click to add a note, drag to set its length, drag a note to move it, drag its right edge to resize, box-select, `Delete`, `Ctrl/Cmd+D`, copy and paste at the playhead, and arrow keys to transpose or nudge. Snap runs from 1/1 to 1/32 including triplets (hold `Alt` to bypass it). The transport in the top bar plays the song (`Space`), returns to the start (`Home`), loops, and has a metronome and a one-bar count-in. Recording from the keyboard and a velocity lane are still to come.

**Projects.** The **Project** menu starts a new project, opens or saves a `.synthlab.json` file, and renames the project. The project is also saved automatically in your browser and restored when you reload.

**Presets.** Choose a factory preset from the top bar to hear a teaching idea (plucked bass, wobble bass, PWM strings, organ, and so on). Edit a sound, then **Save as…** to keep it. **Export** and **Import…** move presets as JSON files.

**Keyboard.** The computer keyboard plays two overlapping rows of piano keys, located by physical position so the layout works on QWERTY, AZERTY and QWERTZ.

| Keys | Action |
| --- | --- |
| `Z X C V B N M , . /` and `S D G H J L ;` | Lower manual (from C3) |
| `Q W E R T Y U I O P [ ]` and `2 3 5 6 7 9 0 =` | Upper manual (from C4) |
| `←` / `→` | Octave down / up |
| `↓` / `↑` | Velocity down / up |
| `Shift` (held) | Sustain pedal |
| `Esc` | All notes off |
| `?` | Help for the focused control |

The on-screen keyboard can be played with the mouse or touch, including by dragging across keys.

## Running it locally

Requires Node.js 22 or newer. To start the app, run:

```bash
make
```

This installs dependencies the first time, starts the dev server and opens http://localhost:5173 in your browser. Use `make PORT=5180` for another port, and `make clean` to remove installed dependencies.

Without `make`, run `npm install` and then `npm run dev`.

Development commands (each has a `make` target; the npm command it runs is in brackets):

```bash
make check         # typecheck, lint, unit and audio tests, help-content check (what CI runs) [npm run check]
make test          # unit and audio tests; audio runs in headless Chromium [npm test]
make e2e           # installs the browsers, then runs end-to-end tests on Chromium, Firefox and WebKit [npm run e2e]
npm run content    # validate the help content in content/help/ (no make target)
```

`CLAUDE.md` has more detail on the architecture, and single-test commands.

## Technology

TypeScript (strict), React 19, Zustand, Vite, and the Web Audio API. Audio code is kept separate from the UI and talks to it through a small engine interface. The delay and pulse oscillator are AudioWorklets. Tests use Vitest (including real audio rendering in Chromium through `OfflineAudioContext`) and Playwright. Help content is Markdown with YAML front-matter, validated at build time.

Documentation in this repo:

- `Synth Lab — Educational Synthesiser PRD.md`: product requirements.
- `synth-lab-implementation-plan.md`: the phased task plan and its status.
- `docs/performance.md`: audio capacity measurements.
- `docs/content-review.md`: status of the help-content accuracy review.

## Roadmap

Based on the implementation plan (`synth-lab-implementation-plan.md`).

**Done**

- [x] Project scaffold, parameter registry and engine contracts
- [x] Audio engine: voices with analytic envelopes, a poly/mono/legato allocator, LFO, PolyBLEP pulse, effects, shared reverb
- [x] Synth panel, section panels, scope, spectrum, meter, filter and envelope plots
- [x] Factory presets (12 teaching presets plus Init), user presets, import and export
- [x] Laptop keyboard and on-screen keyboard
- [x] Help content, help drawer, "Try this" experiments and animated diagrams
- [x] Type a value into any knob or slider readout
- [x] Fixed-viewport tabbed layout: keyboard, scope, spectrum and meter always in view
- [x] Project state with up to 8 tracks, one engine each, mixer (volume, mute, solo) and shared reverb
- [x] Sequencer and transport: sample-accurate playback, loop, metronome, count-in
- [x] Piano roll: rendering and full editing, with trimmed overlaps and keyboard-only entry
- [x] Track list and arrangement overview
- [x] Undo and redo for sound and note edits, tagged by track
- [x] Autosave, project files and the Project menu

**Next**

- [ ] Composition tool: recording from the keyboard (with quantise) and a velocity lane
- [ ] Help content for typed values, the tabbed layout and the composition tool
- [ ] Accessibility pass, performance profiling on target hardware (including an M1 MacBook Air), cross-browser test suite
- [ ] Serum-based colour theme (the app is currently plain)
- [ ] Installable PWA with offline support, bundle budget and static deployment

**Before launch**

- [ ] Independent technical review of the help content and a review by a synth designer
- [ ] Listening check of the presets and "Try this" experiments
- [ ] Usability sessions with beginners

**Later (v1.1 and v2, from the PRD)**

- Chorus effect, Web MIDI keyboard input, WAV export (v1.1)
- MIDI file import and export (v2)

## Status

Synth Lab is in development. The synth, keyboard, presets and help are working and tested. The composition tool is not built yet.

## License

Not yet decided.
