# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run everything from the repo root. Node 22+ is what CI uses.

```bash
make                        # installs deps on first run, then starts the dev server (opens the browser)
npm install
npm run dev                 # Vite dev server on :5173 (also used by e2e tests on :5174)
npm run check               # typecheck + lint + unit/audio tests + content check (what CI runs)
npm run typecheck           # tsc --noEmit (strict)
npm run lint                # ESLint flat config; enforces the UI/audio import boundary
npm test                    # all Vitest projects: "unit" (node/jsdom) and "audio" (Chromium)
npm run test:unit           # unit project only (fast, no browser)
npm run test:audio          # audio project only: real Web Audio in headless Chromium
npm run content             # validates content/help/**; fails on missing or broken help entries
npm run golden:update       # regenerate tests/golden/*.json after an intended sound change; review the diff
npm run e2e                 # Playwright on Chromium, Firefox and WebKit (starts its own dev server)
```

Single tests:

```bash
npx vitest run --project unit src/core/params          # one directory
npx vitest run --project unit src/state/try-this.test.ts
npx vitest run --project audio -t "golden"             # by name
npx playwright test keyboard --project=chromium        # one e2e spec, one browser
npx playwright test -g "Esc stops all sound"           # by name
```

Environment quirk: on the author's Mac, Homebrew Node needed `DYLD_LIBRARY_PATH=/opt/homebrew/Cellar/simdjson/4.6.11/lib` after a simdjson upgrade. Only set it if `node -v` fails with a missing `libsimdjson` error.

First-time e2e setup: `npx playwright install chromium firefox webkit`.

## Architecture

Synth Lab is a browser subtractive synth with a keyboard player, and a planned multi-track piano-roll composer. It is React 19 + Zustand + Vite + TypeScript (strict), with a Web Audio engine. The PRD and phased plan are in `Synth Lab — Educational Synthesiser PRD.md` and `synth-lab-implementation-plan.md`; the plan's task IDs (T0.2, T1.7 …) appear in code comments and test names.

**Layers and the one rule that holds them together.** `src/audio/` owns all Web Audio. `src/ui/` must not import `src/audio/` (ESLint enforces this). The only bridges are the interfaces in `src/core/contracts/` (`SynthEngine`, `AudioHost`, `TrackMixer`) and the event bus. `src/core/` is pure TypeScript with no DOM or Web Audio, and it is where logic should go so it can be unit-tested in Node. `src/app/runtime.ts` is the composition root: the only file that builds real audio and wires it to the UI. `src/app/mock-services.ts` builds the same services on `MockEngine`/`MockAudioHost` for tests.

**The parameter registry is the single source of truth.** `src/core/params/registry.ts` defines every control (range, default, scale, unit, help id, section). Patch schema (`contracts/patch.ts`), UI controls (`ParamControl`), engine routing (`audio/engine.ts` has an exhaustive `ROUTES` map that fails to compile if a parameter is unrouted) and help-content checks all derive from it. Adding a control means editing the registry first, then the engine route, then a help entry; `npm run content` and the route tests catch omissions.

**State flow.** Zustand stores, all created with `createStore` from `zustand/vanilla` so tests and non-React code can use them: `patch-store` (the editable patch; `bindEngineToPatch` pushes diffs to the engine), `app-store` (master volume, keyboard octave/velocity, tempo, audio state), `preset-store` (factory and user presets, persisted via `idb-keyval` behind `state/storage.ts`), `notes-store` (what is sounding, derived from bus events), `help-store` and `try-this`. React reads them through `useStore`; services are passed down via `ServicesContext` in `app/context.tsx`.

**Events.** `core/contracts/events.ts` defines a typed `EventBus`. Note on/off, sustain and panic come from `KeyboardPlayer` (`ui/keyboard/`) and the on-screen keyboard, and are routed to the engine by `app/note-router.ts`. The sequencer will schedule its own notes and is deliberately excluded from that routing. Events carry `audioTime` so a recorder can place them on the audio clock.

**Audio engine.** `SynthEngineImpl` (`audio/engine.ts`) is one per track. Per note it creates a `Voice` (`audio/voice/voice.ts`: oscillator slots with crossfaded waveform swaps, a `BiquadFilterNode` driven by envelope/LFO/key-tracking in cents, amp and filter `Envelope`s). `VoiceAllocator` (`voice/allocator.ts`) is pure policy for poly, mono, legato, stealing and sustain; it is fuzz-tested. Modulation is `LfoUnit` (`modulation/`). Two worklets are hand-written plain JS in `audio/worklets/`: a PolyBLEP pulse and a stereo delay. The delay is a worklet deliberately, because Chromium inserts an extra render quantum into `DelayNode` feedback loops, so echoes drift off the grid.

**Envelopes are modelled analytically.** `voice/envelope.ts` mirrors every automation event it schedules, so `valueAt(t)` knows the exact `AudioParam` value. That is how early release and retrigger avoid `cancelAndHoldAtTime` (missing in Firefox). The UI envelope dots use the same model (`core/viz/plots.ts`).

**Effects and CPU.** `EffectsChain` runs distortion → delay → reverb. Reverb is a per-track send into a shared `ReverbHub` (`audio/effects/reverb-hub.ts`), one convolver per size, because convolution is linear and per-track convolvers could not hold real time with 8 tracks. Convolvers exist only while a send is attached. Filter params are k-rate on purpose; audio-rate `detune` forced per-sample coefficient recalculation. `docs/performance.md` has the measurements and the wiring rule for T5.1 (one hub per project).

**Testing layers and where they run:**
- `unit` project (`vitest.config` in `vite.config.ts`): pure logic under `src/core`, `src/state`, `src/content`, plus jsdom component tests (`*.test.tsx`).
- `audio` project: `*.audio.test.ts` runs in real headless Chromium through Vitest browser mode, using `OfflineAudioContext`. Assertions are on rendered samples and spectra, never wall-clock time. `src/audio/testing/` has render, fingerprint, measurement and benchmark helpers. Golden files live in `tests/golden/`; their read/write goes through Vitest browser commands defined in `vite.config.ts`.
- `tests/e2e/`: Playwright. Tests assert on app state through `window.__synth` (set in `app/runtime.ts`) plus accessibility names, not pixels. Visualiser and plot specs read canvas pixels.

**Help content.** Markdown with YAML front-matter in `content/help/{sections,controls}/`, plus `glossary.yml`. `src/content/validate.ts` holds the PRD's rules (required headings, "Beyond this synth" keywords per section, British spelling, "Try this" patches validated against the registry); `scripts/check-content.ts` runs them. Diagrams are referenced as `::diagram{name="…"}` and rendered by `ui/help/Diagrams.tsx`.

**Layout and the help drawer.** `App.tsx` nests `HelpProvider` (context and `?`/Esc handling) around `HelpLayout` (the drawer sits beside the synth; the panel reflows using a container query on `.app-main`). Synth panel sections are in `ui/synth/`, one per registry section, built from a single `Param` wrapper.

## Conventions that aren't obvious from the code

- Time is audio-clock seconds in the engine and events; ticks (PPQ 960) are for the sequencer and project model, which are not built yet.
- Values are stored in registry units (Hz, seconds, fractions for `%`, dB for master). Never divide `%` values by 100 in the engine.
- Keyboard player and help both claim `?`/Esc/arrow keys; check their guards (`isTypingTarget`, `[data-arrow-owner]`, `isHelpKey`) before adding global key handling.
- Canvas visualisers all subscribe to one `requestAnimationFrame` loop in `ui/visualisers/raf-loop.ts`; do not add a loop per canvas.
- Phase status and remaining work are tracked in `synth-lab-implementation-plan.md`. Phase 5 (sequencer, piano roll, undo, recording, persistence) and T6 are not implemented.
- Work is on `main` and pushed to `origin` (github.com/babak4/synth-lab). `README.md` holds the user-facing overview and roadmap; keep it in step when a phase completes.
