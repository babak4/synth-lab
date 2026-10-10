# Synth Lab

Synth Lab is a browser-based subtractive synthesiser built to teach. Every section of the synth has a help button that explains what it does, how to hear it, and how professional synths go further. You play it with your computer keyboard, and a composition tool for multi-track loops is planned.

It is a static web app with no accounts, no cloud sync and no third-party tracking. Projects and presets are stored in your browser.

## Who it is for

- Beginners and hobbyists who use presets but don't know what the knobs do.
- Music production students who want a sandbox next to their coursework.
- Teachers who want a free, zero-install tool to demonstrate synthesis in class.

## Using it

Open the app in a recent Chrome, Edge, Firefox or Safari. Click **Start audio** (or press any note key); browsers only allow sound after a user action.

**The synth panel** is laid out in signal-flow order, so the sound travels left to right and top to bottom:

- **Oscillators and mixer:** two oscillators, a sub-oscillator and noise.
- **Filter:** a multimode filter with cutoff, resonance, envelope amount and key tracking. A live response curve shows its shape.
- **Envelopes:** an amp envelope and a filter envelope, each with a moving dot that follows held notes.
- **LFO:** one modulation source aimed at pitch, cutoff, amplitude or pulse width, optionally synced to the tempo.
- **Voicing:** poly, mono or legato, with voice count and glide.
- **Effects:** distortion, delay and reverb, in that fixed order.
- **Master:** volume, an oscilloscope, a spectrum analyser and a level meter.

**Help.** Click any **?** button to open the help drawer beside the panel (the controls stay visible and playable). The drawer has back and forward navigation, glossary terms with tooltips, and "Try this" experiments with **Set it up**, **A/B** and **Undo**. Press `?` with a control focused for its help, or use **Help** in the top bar for the full index. Press `Esc` to close the drawer.

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

Requires Node.js 22 or newer.

```bash
npm install
npx playwright install chromium firefox webkit   # only needed for the e2e tests
npm run dev                                      # http://localhost:5173
```

Development commands:

```bash
npm run check      # typecheck, lint, unit and audio tests, help-content check (what CI runs)
npm test           # unit and audio tests (audio runs in headless Chromium)
npm run e2e        # end-to-end tests on Chromium, Firefox and WebKit
npm run content    # validate the help content in content/help/
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

**Next**

- [ ] Composition tool: track state and multi-track audio, sequencer scheduler and transport, piano roll (rendering, editing, velocity lane), undo/redo, recording from the keyboard, track list, autosave and project files
- [ ] Accessibility pass, performance profiling on target hardware, cross-browser test suite
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
