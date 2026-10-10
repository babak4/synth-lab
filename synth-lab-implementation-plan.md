# Synth Lab — Implementation Plan

Source: *Synth Lab — Educational Synthesiser PRD* (10 Oct 2026). Section numbers below (e.g. PRD §3.2) refer to that document.

This plan breaks the PRD into tasks that one or more coding agents can execute. Each task has an ID, dependencies, deliverables, acceptance criteria, a complexity rating and a suggested model and effort level. Tasks in the same phase with no dependency between them can run in parallel.

---

## 1. How to use this plan

### 1.1 Roles

| Role | Responsibility | Suggested model |
| --- | --- | --- |
| **Orchestrator** | Owns this plan, the shared contracts (T0.2), task assignment, merging and integration. Reviews every PR touching `src/core/`. | Claude Sonnet 5.5, high effort |
| **Implementer agents** | Execute one task each on its own branch/worktree. | Per task (see tables) |
| **Reviewer agent** | Fresh-context review of high-risk tasks (marked ★) before merge. Never the same agent that wrote the code. | Claude Sonnet 5.5, high effort |
| **Human** | Listening checks, the help-content expert review (T4.6), measurements on target hardware (T6.2), final visual sign-off (T7.3). | — |

**Model policy:** only Claude Sonnet 5.5 and Claude Haiku 5.5 are used, for implementation and for every agent role. Claude Opus is not used anywhere in this plan.

### 1.2 Rules for every agent

1. Read this plan, the PRD section named in your task, and `src/core/contracts/` before writing code.
2. Do **not** change anything in `src/core/contracts/` or `src/core/params/registry.ts`. If you need a change, stop and report it to the orchestrator with the proposed diff.
3. Work on a branch named `task/<ID>-<slug>`. One task per PR.
4. A task is done only when: its acceptance criteria pass, `npm run check` (typecheck, lint, unit tests, content check) passes, and new code has tests where the task says so.
5. Keep audio code free of UI imports and UI code free of Web Audio imports. The only bridge is the engine interface (T0.2).
6. Report at the end: what changed, files touched, anything left undone, and any contract change requests.

### 1.3 Complexity scale

| Rating | Meaning | Typical size |
| --- | --- | --- |
| **S** | Well-trodden pattern, little ambiguity | < 300 lines, < 2 h agent time |
| **M** | Some design decisions or several moving parts | 300–800 lines |
| **L** | Tricky domain logic, timing, or interaction design; needs careful testing | 800–1,500 lines |
| **XL** | Hard real-time, DSP or complex interaction; high risk of subtle bugs | > 1,500 lines or very high correctness bar |

### 1.4 Model and effort guidance

| Model | Use it for |
| --- | --- |
| **Claude Sonnet 5.5** | All implementation with design decisions or a high correctness bar: DSP, audio timing, the sequencer, the piano-roll editor, layout and focus behaviour, teaching content, state, and all reviews. |
| **Claude Haiku 5.5** | Mechanical or pattern-following work: scaffolding, config, storage wiring, simple components once a pattern exists, fixture data, small follow-ups. |

Effort: **low** for mechanical tasks, **medium** for typical feature work, **high** where the task involves real-time audio, concurrency/timing, numerical correctness or non-obvious interaction design.

Work that this plan once gave to a larger model now goes to Sonnet 5.5 at **high** effort, and every such task is marked ★ so it gets a fresh-context Sonnet review before merge. If a Haiku task turns out to need real design decisions, move it to Sonnet rather than raising Haiku's effort.

---

## 2. Technical decisions (fixed for v1)

These resolve choices the PRD left open. Change them only via the orchestrator.

| Area | Decision | Reason |
| --- | --- | --- |
| Language | TypeScript, `strict: true` | Shared types across engine, UI and content |
| Build | Vite | Fast dev loop, native AudioWorklet module support |
| UI | React 19 + Zustand for state | Widest agent familiarity; Zustand works outside React (engine subscriptions) |
| Rendering | DOM/SVG for controls; Canvas 2D for piano roll, scope, spectrum | Canvas needed for 60 fps at large note counts |
| Schemas | Zod | Runtime validation of presets, projects, help front-matter |
| Unit tests | Vitest (+ `node-web-audio-api` or `OfflineAudioContext` in browser mode for audio tests) | |
| E2E tests | Playwright on Chromium, Firefox, WebKit | Matches PRD browser list |
| Help content | Markdown + YAML front-matter in `content/help/` | Editable without code (PRD §4.4) |
| Persistence | IndexedDB (via `idb-keyval`) for autosave; JSON for export | |
| PWA | `vite-plugin-pwa` | Offline after first load |

Scope defaults for open PRD questions: no guided lessons in v1; chorus deferred to v1.1; Web MIDI deferred to v1.1; WAV export v1.1.

---

## 3. Repository layout

```
synth-lab/
  content/help/              # Markdown help entries, one file per id
    sections/                # oscillators.md, filter.md, ...
    controls/                # osc-a-waveform.md, filter-cutoff.md, ...
    glossary.yml
  public/impulses/           # (optional) reverb IRs if not generated
  src/
    core/
      contracts/             # engine.ts, patch.ts, project.ts, events.ts  (T0.2, locked)
      params/registry.ts     # single source of truth for every parameter (T0.2, locked)
    audio/
      context.ts             # AudioContext lifecycle, master chain
      voice/                 # voice graph, envelopes, allocator
      worklets/              # pulse-osc.worklet.ts, sh-lfo.worklet.ts
      modulation/            # LFO, routing
      effects/               # distortion, delay, reverb
      engine.ts              # SynthEngine implementation
      track-mixer.ts
    sequencer/               # scheduler, transport, recorder
    state/                   # zustand stores: patch, project, ui, history
    ui/
      components/            # Knob, Slider, Toggle, Select, HelpButton...
      synth/                 # section panels
      visualisers/
      keyboard/
      composer/              # track list, piano roll
      help/                  # drawer, glossary tooltips, index
    content/                 # help loader, try-this actions
    presets/                 # init + teaching presets (JSON)
  scripts/check-content.ts
  tests/e2e/
```

---

## 4. Dependency overview

```
Phase 0  T0.1 ─► T0.2 ─► T0.3
                   │
Phase 1            ├─► T1.1 ─► T1.2★ ─► T1.4★ ─► T1.7 ─► T1.8
                   │            ├─► T1.3★
                   │            ├─► T1.5
                   │            └─► T1.6
Phase 2            ├─► T2.1 ─► T2.2 (needs T0.3, T1.7)
                   │           T2.3, T2.4 (need T1.1/T1.7)
                   │           T2.5 (needs T1.7)
Phase 3            ├─► T3.1 (needs T1.4) ─► T3.2
Phase 4            ├─► T4.2 ─► T4.1 ─► T4.3, T4.5
                   │   T4.4 (needs only T0.2 registry; can start early) ─► T4.6★
Phase 5            └─► T5.1 ─► T5.2★ ─► T5.5
                       T5.3a ─► T5.3b★ ─► T5.3c
                       T5.4, T5.6, T5.7
Phase 6  T6.1–T6.4 after phases 2–5
```

### Parallel lanes once T0.2 is merged

(Historical: these lanes built phases 0–4. For the remaining work, use the waves in section 4a.)

| Lane | Tasks | Notes |
| --- | --- | --- |
| A — Audio engine | T1.1 → T1.2 → T1.3/T1.4/T1.5/T1.6 → T1.7 → T1.8 | Critical path; start first |
| B — UI kit and panels | T0.3 → T2.1 → T2.2 | Can build against a mock engine (T0.2 provides one) |
| C — Help system and content | T4.2 → T4.1 → T4.3; T4.4 in parallel | Content writing can start on day one |
| D — Composer | T5.3a → T5.3b → T5.3c; T5.4; T5.6 | Editor works on state only; audio hookup later |
| E — Keyboard | T3.1 → T3.2 | Uses mock engine until T1.4 lands |

---

## 4a. Remaining work — priorities, models and parallel waves

**Done:** phases 0–4 (T0.1 to T4.5), all implemented with Claude Sonnet 5.5. T4.6 has an author self-review only (`docs/content-review.md`).

**How to read this:** if one agent is working, follow the priority numbers. With several agents, run each wave's tasks in parallel, each on its own branch or worktree (rule 1.2.3), and merge in priority order.

| Priority | Wave | Task | Model | Effort | Depends on | Runs in parallel with |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | T2.6 ★ Editable numeric readouts | Sonnet 5.5 | medium | done tasks only | T2.7, T5.1, T5.4 |
| 2 | 1 | T2.7 ★ Fixed-viewport tabbed layout | Sonnet 5.5 | high | done tasks only; merge after T2.6 | T2.6, T5.1, T5.4 |
| 3 | 1 | T5.1 Project state and multi-track audio | Sonnet 5.5 | high | done tasks only | T2.6, T2.7, T5.4 |
| 4 | 1 | T5.4 Undo/redo (command stack) | Sonnet 5.5 | medium | done tasks only | T2.6, T2.7, T5.1 |
| 5 | 2 | T5.2 ★ Sequencer scheduler and transport | Sonnet 5.5 | high | T5.1 | T5.3a, T5.6, T5.7 |
| 6 | 2 | T5.3a Piano roll rendering | Sonnet 5.5 | high | T2.7 (Composition tab) | T5.2, T5.6, T5.7 |
| 7 | 2 | T5.6 Track list and arrangement overview | Sonnet 5.5 | medium | T5.1, T2.7 | T5.2, T5.3a, T5.7 |
| 8 | 2 | T5.7 Persistence | Haiku 5.5 | medium | T5.1 | T5.2, T5.3a, T5.6 |
| 9 | 3 | T5.3b ★ Piano roll editing | Sonnet 5.5 | high | T5.3a, T5.4 | T5.5 |
| 10 | 3 | T5.5 Recording from the keyboard | Sonnet 5.5 | high | T5.2 | T5.3b |
| 11 | 4 | T5.3c Velocity lane | Haiku 5.5 | medium | T5.3b | T4.7 |
| 12 | 4 | T4.7 Help content update for the new layout and the composition tool | Sonnet 5.5 | medium | T2.6, T2.7, T5.3b, T5.5 | T5.3c |
| 13 | 5 | T6.1 Accessibility pass | Sonnet 5.5 | medium | waves 1–4 | T6.2, T6.3, T6.4 |
| 14 | 5 | T6.2 Performance profiling and fixes | Sonnet 5.5 | high | waves 1–4; a human runs `/bench.html` on an M1 | T6.1, T6.3, T6.4 |
| 15 | 5 | T6.3 Cross-browser end-to-end suite | Sonnet 5.5 | medium | waves 1–4 | T6.1, T6.2, T6.4 |
| 16 | 5 | T6.4 PWA, bundle budget and deploy | Haiku 5.5 | low | waves 1–4 | T6.1, T6.2, T6.3 |
| 17 | 6 | T7.1 Serum-based theme tokens | Sonnet 5.5 | medium | T2.7 | any wave after wave 1 (spare capacity) |
| 18 | 6 | T7.2 Section and panel styling | Sonnet 5.5 | medium | T7.1 | T7.3 |
| 19 | 6 | T7.3 Visual review against the reference | Haiku 5.5 | low | T7.1 | T7.2 |
| — | — | T4.6 Independent accuracy review, then expert sign-off | Sonnet 5.5 (fresh context), then a human | high | T4.7 | anything |

Notes:
- **Wave 1** tasks touch different files: T2.6 the control kit (`ui/components`), T2.7 the app shell and layout (`ui/App.tsx`, CSS), T5.1 state and audio wiring (`state/`, `app/runtime.ts`, a new `TrackMixer`), T5.4 a new pure command stack. Expect small merge conflicts in `app/runtime.ts` and `App.tsx` only.
- **T5.4 starts early on purpose.** It is pure logic with no dependencies, and T2.6 (typed values), T4.3 ("Set it up") and T5.3b all need undo.
- **T7.1 depends only on T2.7** (it restyles the new layout), so a spare agent can take it while waves 2–5 run. It is still lowest priority.
- ★ tasks need a fresh-context Sonnet 5.5 review (high effort) before merge.

---

## 5. Tasks

### Phase 0 — Foundations

#### T0.1 Scaffold the repository
- **PRD:** §7.1
- **Depends on:** —
- **Deliverables:** Vite + React + TS project; ESLint, Prettier; Vitest; Playwright with three browsers; GitHub Actions CI running `npm run check` and e2e; `npm run check` script; folder layout from §3; README with dev commands.
- **Acceptance:** fresh clone → `npm i && npm run check && npm run e2e` passes on CI; a blank page renders.
- **Complexity:** S
- **Model:** Haiku 5.5, low effort

#### T0.2 Define core contracts and the parameter registry ★
- **PRD:** §3, §6, §7.3
- **Depends on:** T0.1
- **Deliverables:**
  - `params/registry.ts`: one entry per parameter with `id`, `section`, `label`, `type` (continuous/enum/bool), `min`, `max`, `default`, `scale` (linear/log/exp), `unit`, `step`, `helpId`, `smoothingMs`. Covers every control in PRD §3.1–§3.7 and §5.2.
  - `contracts/patch.ts`: Zod `PatchSchema` derived from the registry; `schemaVersion`.
  - `contracts/project.ts`: `ProjectSchema` (tempo, time signature, length, loop, tracks[] with id/name/colour/volume/mute/solo/patch/notes[]); `Note = { id, pitch (0–127), start (ticks), duration (ticks), velocity (1–127) }`; PPQ = 960.
  - `contracts/engine.ts`: `SynthEngine` interface — `noteOn(pitch, velocity, time?)`, `noteOff(pitch, time?)`, `allNotesOff()`, `setParam(id, value, time?)`, `loadPatch(patch)`, `getAnalyser()`, `getVoiceStates()` (for UI dots), `dispose()`; `TrackMixer` interface.
  - `contracts/events.ts`: typed event bus (note on/off, transport, param change).
  - A `MockEngine` implementing the interface (logs calls, no audio) so UI lanes can work before the real engine exists.
- **Acceptance:** registry covers 100% of PRD controls (checklist in PR); schemas round-trip a sample patch and project; Orchestrator signs off. After merge these files are locked.
- **Complexity:** M (small code, high leverage — mistakes ripple everywhere)
- **Model:** done (implemented with Sonnet 5.5)

#### T0.3 UI component kit
- **PRD:** §2 principles
- **Depends on:** T0.2
- **Deliverables:** `Knob` (drag vertical, fine with Shift, double-click reset, wheel, arrow keys, ARIA slider role with value text in units), `Slider`, `Toggle`, `Segmented` (waveform icons), `Select`, `HelpButton` (?), `Section` frame with title + help button + optional "more" toggle; theme tokens (light/dark); all components bind to a registry `id` and read range/scale/unit from it.
- **Acceptance:** Storybook-style demo page; keyboard-only operation works; screen reader announces label and value; unit tests for value↔position mapping on log scales.
- **Complexity:** M
- **Model:** Sonnet 5.5, medium effort

---

### Phase 1 — Audio engine

#### T1.1 Audio context and master chain
- **PRD:** §3.7, §7.2, §7.4 (hearing safety)
- **Depends on:** T0.2
- **Deliverables:** singleton context with `latencyHint: "interactive"`; unlock on first user gesture with UI state; master `GainNode` (starts −12 dB) → `DynamicsCompressorNode` limiter (threshold −1 dB, ratio 20, attack 1 ms) → `AnalyserNode` → destination; output level meter data with clip flag.
- **Acceptance:** no sound before first click; limiter cannot be bypassed via any API; meter reports peak/RMS.
- **Complexity:** S
- **Model:** Sonnet 5.5, medium effort

#### T1.2 Voice graph and envelopes ★
- **PRD:** §3.1, §3.2, §3.3
- **Depends on:** T1.1
- **Deliverables:**
  - `Voice` class building: osc A, osc B (`OscillatorNode`, pulse via T1.3 when ready — start with square as placeholder), sub osc, noise (shared looping white-noise buffer), per-source `GainNode`s (mixer), `BiquadFilterNode`, amp `GainNode`.
  - ADSR implementation on `AudioParam` automation that is correct for re-trigger and early release (cancel and hold at current value — use `cancelAndHoldAtTime` with fallback for Firefox).
  - Filter envelope and key tracking applied via the filter's `detune` (cents) so modulation is exponential.
  - Velocity sensitivity for amp and filter.
  - Voice lifecycle: after release completes, stop sources and disconnect all nodes.
- **Acceptance:** OfflineAudioContext tests: note renders expected fundamental (FFT peak within 1%); release reaches silence and node count returns to baseline; no discontinuities > threshold at note start/end and when retriggered mid-release; envelope timing within ±2 ms.
- **Complexity:** XL
- **Model:** done (implemented with Sonnet 5.5)

#### T1.3 Pulse oscillator worklet (PWM) ★
- **PRD:** §3.1 (pulse width), §7.2
- **Depends on:** T1.1
- **Deliverables:** `AudioWorkletProcessor` generating band-limited pulse via PolyBLEP; `AudioParam`s `frequency`, `detune`, `pulseWidth` (a-rate so LFO can drive PWM); loader that registers the module once per context; integration point in `Voice`.
- **Acceptance:** aliasing test: at 4 kHz fundamental, energy above Nyquist-folded harmonics stays below −40 dB relative to fundamental; PW 50% matches square within tolerance; PW sweep has no clicks; CPU: 64 instances run under 10% of an audio render quantum budget on Chromium.
- **Complexity:** L
- **Model:** done (implemented with Sonnet 5.5)

#### T1.4 Voice allocator, voicing modes and glide ★
- **PRD:** §3.5
- **Depends on:** T1.2
- **Deliverables:** allocator for poly (1–8 voices, steal oldest with a 5 ms fade), mono (last-note priority, retrigger), legato (no retrigger while notes held, glide between them); glide via `setTargetAtTime` on frequency; held-note stack so releasing the top note in mono returns to the previous held note; sustain-pedal semantics (notes released while sustain held stay on until pedal up); `allNotesOff`.
- **Acceptance:** unit tests for every mode with scripted note sequences, including stealing, sustain and note-stack fallback; no stuck notes after 10,000 randomised on/off events (fuzz test).
- **Complexity:** L
- **Model:** done (implemented with Sonnet 5.5)

#### T1.5 LFO and modulation routing
- **PRD:** §3.4
- **Depends on:** T1.2
- **Deliverables:** LFO with sine/triangle/saw/square (`OscillatorNode`) and sample-and-hold (small worklet or stepped `PeriodicWave` at rate); depth `GainNode` scaled per destination (pitch: cents, cutoff: cents, amp: gain, PW: fraction); single-destination switching without clicks; tempo sync (rate from BPM and division); retrigger mode (per-voice LFO phase reset) vs free-running (one global LFO).
- **Acceptance:** offline tests confirm modulation depth and rate at each destination; switching destination while playing produces no clicks; tempo-synced rate correct at 60/120/180 BPM.
- **Complexity:** M
- **Model:** Sonnet 5.5, high effort

#### T1.6 Effects chain
- **PRD:** §3.6
- **Depends on:** T1.1
- **Deliverables:** distortion (`WaveShaperNode`, tanh curve generated from drive, 4× oversample, post tone low-pass, dry/wet); delay (time in ms or synced, feedback capped at 0.9, ping-pong via channel merger, dry/wet); reverb (`ConvolverNode` with three procedurally generated impulse responses — short/room/hall — via decaying filtered noise, dry/wet); per-effect bypass with click-free crossfade; fixed order.
- **Acceptance:** each effect bypassed is bit-transparent within tolerance; feedback never exceeds unity; switching reverb size crossfades without a dropout.
- **Complexity:** M
- **Model:** Sonnet 5.5, medium effort

#### T1.7 Engine assembly and parameter binding
- **PRD:** §7.3
- **Depends on:** T1.2, T1.4, T1.5, T1.6 (T1.3 can land after)
- **Deliverables:** `SynthEngine` implementing the T0.2 interface; maps each registry `id` to the right AudioParam(s) on all active and future voices, applying the registry's scale and `smoothingMs`; `loadPatch` diffs and applies; `getVoiceStates()` returns envelope stage/progress per voice for UI; engine subscribes to the Zustand patch store.
- **Acceptance:** every registry id has a binding (test enumerates the registry); rapid knob sweeps produce no zipper noise (offline test of a 1 s cutoff sweep, max sample delta below threshold); swapping MockEngine for SynthEngine requires no UI change.
- **Complexity:** M
- **Model:** Sonnet 5.5, high effort

#### T1.8 Audio test harness and golden renders
- **PRD:** §7.4
- **Depends on:** T1.7
- **Deliverables:** helper to render a patch + note list offline and compute RMS, peak, FFT, click detector; golden-render tests for each teaching preset (spectral fingerprint, not exact samples); performance benchmark page: 8 tracks × 8 voices, all effects on, reporting audio underruns.
- **Acceptance:** CI runs audio tests in headless Chromium; benchmark documented with numbers on an M1 MacBook Air.
- **Complexity:** M
- **Model:** done (implemented with Sonnet 5.5)

---

### Phase 2 — Synth panel

#### T2.1 Panel layout and signal-flow connectors
- **PRD:** §2
- **Depends on:** T0.3
- **Deliverables:** top bar (preset menu, master volume, audio on/off, tempo, help index button); synth panel with sections in signal-flow order (sources → mixer → filter → amp, envelopes and LFO below, effects → master); connector lines drawn between sections; responsive down to 1280 px wide; zones for keyboard and composer. (Superseded by T2.7: the keyboard is pinned and the composer becomes a tab.)
- **Acceptance:** matches the PRD signal-flow diagram; no horizontal scroll at 1280 px; layout snapshot test.
- **Complexity:** M
- **Model:** Sonnet 5.5, medium effort

#### T2.2 Section panels bound to parameters
- **PRD:** §3.1–§3.6
- **Depends on:** T2.1, T0.3 (works on MockEngine; final check with T1.7)
- **Deliverables:** Oscillators/mixer, Filter, Amp envelope, Filter envelope, LFO, Voicing, Effects, Master sections; every control from the registry placed and wired; pulse-width control enabled only for pulse; sync toggles switch between Hz and divisions; every control and section has a `HelpButton` with the registry's `helpId`.
- **Acceptance:** test asserts every registry id is rendered exactly once with a help button; changing a control updates the patch store.
- **Complexity:** M (wide but repetitive; can be split per section across agents)
- **Model:** Sonnet 5.5, medium effort (or Haiku 5.5, medium for individual simple sections once one section exists as a pattern)

#### T2.3 Visualisers: scope, spectrum, meter
- **PRD:** §3.7
- **Depends on:** T1.1
- **Deliverables:** oscilloscope on Canvas with trigger stabilised to the most recent note's period (rising zero-crossing search over one period window); spectrum analyser with log frequency axis and note labels; output meter with clip hold; all at 60 fps using a single `requestAnimationFrame` loop; pauses when tab hidden.
- **Acceptance:** a held saw at A3 appears stationary on the scope; spectrum peaks align with harmonics; frame time under 4 ms on target hardware.
- **Complexity:** M
- **Model:** Sonnet 5.5, high effort

#### T2.4 Per-section plots
- **PRD:** §3.2, §3.3, §3.4
- **Depends on:** T1.7
- **Deliverables:** filter response curve via `BiquadFilterNode.getFrequencyResponse` on a shadow node, redrawn on param change and animated with modulation; ADSR shape plots with a dot per active voice from `getVoiceStates()`; LFO shape plot with a moving phase marker.
- **Acceptance:** curves update within one frame of a control change; dots track held notes accurately through release.
- **Complexity:** M
- **Model:** Sonnet 5.5, medium effort

#### T2.5 Presets
- **PRD:** §3.8
- **Depends on:** T1.7
- **Deliverables:** Init preset; 12 teaching presets as JSON, each with `teaches` metadata linking to a help entry; preset menu; save user presets to IndexedDB; import/export JSON with schema validation and migration hook.
- **Split:**
  - T2.5a sound design of the 12 presets — done (Sonnet 5.5). Each preset's concept is verified by measurement in `presets.audio.test.ts`; the human listening check is still open.
  - T2.5b preset storage and menu — Haiku 5.5, low.
- **Acceptance:** every preset validates against `PatchSchema`; each preset's demonstrated concept is audible (orchestrator listening check).
- **Complexity:** M overall

---

### Phase 2b — Priority additions

#### T2.6 Editable numeric readouts ★ (priority 1)
- **Why:** rotating a knob to an exact value is slow and fiddly. Players want to click the number and type it.
- **PRD:** §2 (every control has a reset and an explanation; no new controls), §5.3 (keyboard player must not fire while typing).
- **Depends on:** T2.2 (panels), T0.3 (control kit), T5.4 for undo once it exists (until then, typed edits are not undoable — say so in the UI notes).
- **Deliverables:**
  - Every numeric readout on a knob, slider and the top-bar master volume becomes a text-like button. It looks like the readout today; on hover it shows an underline or border, and it is focusable with Tab.
  - Click (or Enter or Space when focused) turns it into a text input pre-filled with the value in display form, with the text selected.
  - Input accepts the display format and plain numbers: `2.5k`, `2500`, `300 ms`, `0.3 s`, `-12 dB`, `50%`, `0.5`, `+3 st`, `-12 cents`. Units are optional when unambiguous; a bare number is read in the control's display unit.
  - Parsing is the inverse of `formatValue` (`core/params/scale.ts`); values are clamped to the registry range and quantised to its step (so a stepped control snaps and a log control stays musical).
  - Enter or blur commits; Esc cancels and restores the old value. An unparseable entry keeps the field open with a visible message (`aria-invalid` plus text), and does not change the value.
  - Committing goes through the same path as a knob drag, so smoothing, the engine binding and the help/A-B state all behave as normal.
  - Typing never reaches the keyboard player or the `?` key handler (the existing `isTypingTarget` guard already covers text inputs; verify it).
  - Enum controls and toggles are unchanged.
- **Acceptance:**
  - Unit tests: for every continuous registry control, `formatValue` then parse returns the original value within one step; out-of-range and garbage input are rejected or clamped as specified.
  - Component test: click → type → Enter updates the patch store; Esc restores; invalid input shows the error and keeps the old value.
  - Playwright on Chromium, Firefox and WebKit: type `2.5k` into Cutoff and the knob and the engine both move; typing `c` or `?` in the field plays no note and opens no help.
  - axe passes with an editor open.
- **Complexity:** S
- **Model:** Sonnet 5.5, medium effort

#### T2.7 Fixed-viewport tabbed layout ★ (priority 2)
- **Why:** the synth panel is now taller than a laptop screen, so the on-screen keyboard and the bottom zones scroll out of view. Players need the keyboard visible at all times, and they should not have to scroll to reach other controls.
- **Goal:** on a normal laptop screen, nothing scrolls. Controls are grouped into tabs, and you switch between tabs instead of scrolling. A tab only scrolls if its own contents are taller than the space available.
- **Depends on:** T2.1, T2.2, T3.2, T4.1 (all done). Can be built in parallel with T2.6; merge after it, then check that typed values work inside every tab.
- **Deliverables:**
  - **Keyboard pinned to the bottom of the viewport.** It stays visible and in place while any tab is open, with the help drawer open or closed, and while the page is scrolled (there should be nothing to scroll on a normal screen, but this holds if there is). The keyboard's own horizontal scroller still works.
  - **Output strip pinned with the keyboard.** The oscilloscope, spectrum analyser and level meter (with its clip indicator) are always visible, whichever tab is open (PRD §2, goal 5). They share the pinned band with the keyboard, to its right where the width allows and directly above it otherwise, so the band costs as little height as possible. Master volume stays in the top bar, so there is no Output tab.
  - **Tab bar** under the top bar with one tab per group. Proposed grouping (confirm before building; each group is one registry section list, so the groups are easy to change):
    - *Sound*: Oscillators, Mixer
    - *Shape*: Filter, Filter envelope, Amp envelope
    - *Modulation*: LFO, Voicing
    - *Effects*: Distortion, Delay, Reverb
    - *Composition*: placeholder until Phase 5, then the track list and piano roll
  - Tabs follow the WAI-ARIA tabs pattern: `role="tablist"`, arrow keys move between tabs, Home and End jump to the ends, the active tab is in the tab order. Tab switching is UI state only; it does not affect the patch, the engine or the keyboard player.
  - **Help links switch tabs.** Opening help for a control on another tab switches to that tab, so the highlighted control is visible. The `?` key and the index behave the same way.
  - The selected tab is remembered per viewer in `localStorage` (a per-viewer convenience only, per the project's storage rules). Storage failures fall back to the default tab.
  - Layout uses the viewport height (`100dvh`) so the keyboard and tab bar fit a 1280×720 or 1280×800 window. The tab body fills the remaining space. If a single tab is taller than that space, only that tab's body scrolls, and the keyboard and tab bar stay in place.
  - The help drawer keeps its current behaviour (beside the content, never over the controls); with the drawer open, the tab body narrows and the keyboard stays full width at the bottom.
  - Visualisers keep a single shared frame loop (`raf-loop.ts`). The section plots (filter response, envelopes, LFO) live in their tabs; only visible canvases draw, so hidden tabs cost nothing.
  - Precedent: Serum 2 uses the same arrangement, with OSC, MIX, FX, MATRIX and GLOBAL tabs and a keyboard pinned along the bottom.
- **Acceptance:**
  - Playwright on Chromium, Firefox and WebKit at 1280×720 and 1280×800 with the help drawer open and closed: `document.documentElement.scrollHeight` equals the viewport height for every tab, and the bounding boxes of the keyboard, the scope and the spectrum are fully inside the viewport on every tab.
  - The scope keeps drawing (its canvas changes) while each tab is open and a note is held.
  - A tab whose content is taller than the space available scrolls inside the tab body only; the test checks that the page itself never scrolls and that the keyboard and tab bar stay in place while that tab scrolls.
  - Tab keyboard behaviour is tested (arrows, Home, End, Tab order) and axe passes with each tab open.
  - Switching tabs does not change the patch, stop notes, or interrupt a held note (checked against the engine state).
  - Opening help for a control on another tab selects that tab and highlights the control.
- **Complexity:** M
- **Model:** Sonnet 5.5, high effort (layout and keyboard focus are easy to get subtly wrong)

---

### Phase 3 — Keyboard

#### T3.1 Laptop keyboard input
- **PRD:** §5.1–§5.3
- **Depends on:** T0.2 (MockEngine), final check with T1.4
- **Deliverables:** mapping by `KeyboardEvent.code` for the two manuals (lower: KeyZ…Slash whites, KeyS…Semicolon blacks; upper: KeyQ…BracketRight whites, Digit2…Equal blacks); octave ←/→ clamped to C0–C8 reach; velocity ↓/↑ in steps of 16; Shift = sustain; Esc = all notes off; ignore `repeat`; gate input when focus is in a text field; release all held notes on window blur; "keyboard live" indicator; emits note events on the bus (for recording).
- **Acceptance:** unit tests for mapping table; e2e test with French (AZERTY) layout emulation produces identical pitches; no stuck notes when focus changes mid-note.
- **Complexity:** M
- **Model:** Sonnet 5.5, medium effort

#### T3.2 On-screen keyboard
- **PRD:** §5.3
- **Depends on:** T3.1
- **Deliverables:** 61-key SVG keyboard scrollable to 88; lights keys from the event bus; labels with laptop key names for the current octave; mouse/touch play with glissando on drag; note name display.
- **Acceptance:** pressed laptop keys and on-screen highlights match; touch works on iPad Safari.
- **Complexity:** S
- **Model:** Sonnet 5.5, low effort

---

### Phase 4 — Educational layer

#### T4.2 Help content pipeline
- **PRD:** §4.4
- **Depends on:** T0.2
- **Deliverables:** loader for `content/help/**/*.md` with Zod-validated front-matter (`id`, `title`, `kind: section|control`, `related[]`, `presets[]`, `tryThis[]`); glossary YAML; `scripts/check-content.ts` failing CI if any registry `helpId` has no entry, any link/related id is missing, or a section entry lacks the required template headings (PRD §4.2) including "Beyond this synth".
- **Acceptance:** check passes on stub content generated for every helpId; fails with clear messages on a deliberately broken fixture.
- **Complexity:** S
- **Model:** Haiku 5.5, medium effort

#### T4.1 Help drawer and navigation
- **PRD:** §4.1
- **Depends on:** T4.2, T2.1
- **Deliverables:** right-side drawer that never covers the synth panel (panel reflows); opens at entry from any `HelpButton`; highlights the described controls with an outline; back/forward history; per-entry scroll memory; related links; glossary terms underlined with tooltip; Help index listing entries in signal-flow order; `?` opens help for focused control (and is excluded from note mapping), `Esc` closes.
- **Acceptance:** e2e: open help from five different controls, navigate back and forward, verify highlights and scroll memory; axe accessibility check passes.
- **Complexity:** M
- **Model:** Sonnet 5.5, medium effort

#### T4.3 "Try this" actions and A/B
- **PRD:** §4.2 item 3
- **Depends on:** T4.1, T1.7
- **Deliverables:** front-matter `tryThis` entries as patch diffs plus optional note to play; "Set it up" applies the diff (undoable) and optionally plays a demo phrase; "A/B" toggles between the user's previous patch and the demo patch.
- **Acceptance:** setting up and toggling never leaves stuck notes; undo restores the exact prior patch.
- **Complexity:** S
- **Model:** Sonnet 5.5, medium effort

#### T4.4 Help content writing
- **PRD:** §4.2, §4.3
- **Depends on:** T0.2 (registry for ids); can start immediately after
- **Deliverables:** ~10 section entries following the template, each with a "Beyond this synth" section covering at least the PRD §4.3 table row; ~60 control entries (what it does, range in plain terms, one tip); glossary of ~40 terms; `tryThis` diffs for each section.
- **Split:**
  - T4.4a section entries — done (Sonnet 5.5).
  - T4.4b control entries and glossary — done (Sonnet 5.5).
- **Acceptance:** content check passes; reading level check (e.g. Flesch-Kincaid grade ≤ 9) in CI as a warning; British English.
- **Complexity:** L (volume plus accuracy)

#### T4.5 Animated concept diagrams
- **PRD:** §4.2 item 2
- **Depends on:** T4.1
- **Deliverables:** small reusable animated SVG/Canvas components embeddable in Markdown via a shortcode, e.g. `harmonics` (waveform and its harmonic bars, filter cutoff sweeping them away), `adsr` (envelope drawn over a note), `lfo-target` (LFO wobbling a parameter), `beating` (two close frequencies), `unison` (detuned stack). Respect reduced-motion.
- **Acceptance:** each diagram is mathematically correct (harmonic amplitudes of saw = 1/n, square = odd 1/n, triangle = odd 1/n²); reduced-motion shows a static frame.
- **Complexity:** M
- **Model:** Sonnet 5.5, high effort

#### T4.6 Technical accuracy review ★
- **PRD:** §4.4
- **Depends on:** T4.4, T4.5
- **Deliverables:** review report per entry: factual errors, misleading simplifications, missing "Beyond this synth" points, claims about named commercial synths that need checking; fixes applied in a follow-up PR. Human expert review follows.
- **Acceptance:** zero open factual issues; human reviewer sign-off.
- **Complexity:** M
- **Model:** Sonnet 5.5, high effort, in a fresh context (not the agent that wrote the content); then a human synth designer.
- **Status:** author self-review done (`docs/content-review.md`); independent review and human sign-off open. Run after T4.7.

---

#### T4.7 Help content update for the new layout and the composition tool
- **Why:** the help was written before T2.6, T2.7 and Phase 5. The Composition entry describes features that do not exist yet, and some glossary terms are never linked.
- **Depends on:** T2.6, T2.7, T5.3b, T5.5.
- **Deliverables:** rewrite `content/help/sections/composition.md` against the real piano roll, transport and recording; mention typed values in the relevant control entries; describe the tabs and the pinned keyboard in the keyboard entry; link or remove the glossary terms the content check reports as unused.
- **Acceptance:** `npm run content` passes with no unused-glossary warnings; the composition entry matches the shipped behaviour (checked against the e2e tests).
- **Complexity:** S
- **Model:** Sonnet 5.5, medium effort

### Phase 5 — Composition tool

#### T5.1 Project state and multi-track audio
- **PRD:** §6.1, §6.2
- **Depends on:** T0.2, T1.7
- **Deliverables:** Zustand project store (tracks, notes, tempo, signature, length, loop, selected track); one `SynthEngine` per track feeding a `TrackMixer` (volume, mute, solo) into the master chain; "edit sound" binds the synth panel to the selected track's patch; add/duplicate/reorder/delete tracks (max 8), disposing engines cleanly.
- **Acceptance:** switching selected track swaps the panel's patch without affecting sound of other tracks; deleting a playing track leaves no hanging nodes.
- **Complexity:** M
- **Model:** Sonnet 5.5, high effort

#### T5.2 Sequencer scheduler and transport ★
- **PRD:** §6.4, §7.3, §7.4 (timing)
- **Depends on:** T5.1
- **Deliverables:** lookahead scheduler (timer ~25 ms in a Worker to avoid main-thread throttling, schedules 100 ms ahead on `AudioContext.currentTime`); tick↔seconds conversion with PPQ 960; loop region with seamless wrap (notes spanning the loop end are cut and re-triggered correctly); play/stop/return-to-start; playhead position API for UI; metronome (accented downbeat) and one-bar count-in; live edits during playback take effect within the lookahead window; tempo change while playing.
- **Acceptance:** offline test: 16 bars of 1/16 notes at 120 BPM start within 1 ms of target; 30 minutes of looping shows no drift; no double-triggered or missed notes at loop boundary; edits during playback never cause stuck notes.
- **Complexity:** L
- **Model:** Sonnet 5.5, high effort (★: fresh-context Sonnet review before merge)

#### T5.3 Piano roll editor
Split into three tasks so the hardest part is isolated.

**T5.3a Viewport and rendering**
- **PRD:** §6.3
- **Depends on:** T0.2
- **Deliverables:** Canvas grid with bars/beats/subdivision lines; piano key column (click to audition); notes coloured by velocity; horizontal/vertical zoom and scroll; "fit to notes"; playhead; ghost notes from other tracks; virtualised drawing for 5,000+ notes at 60 fps; device-pixel-ratio aware.
- **Complexity:** M
- **Model:** Sonnet 5.5, high effort

**T5.3b Editing interactions ★**
- **Depends on:** T5.3a, T5.4
- **Deliverables:** hit-testing (body vs right-edge resize handle); click to add with current length; drag to draw length; move (pitch and time) with snap; resize; click/shift-click/box selection; delete; Cmd/Ctrl+D duplicate; copy/paste at playhead; arrow keys transpose (±1, Shift ±12) and nudge; length presets incl. dotted and triplet; snap 1/1–1/32, triplets, off; Alt bypasses snap; audition on add; all edits routed through the command stack (T5.4).
- **Acceptance:** Playwright tests for each interaction; overlapping same-pitch notes are prevented or trimmed (decide and document); no edit can produce a negative or zero-length note.
- **Complexity:** XL
- **Model:** Sonnet 5.5, high effort (★: fresh-context Sonnet review before merge)

**T5.3c Velocity lane**
- **Depends on:** T5.3b
- **Deliverables:** lane under the grid with one bar per note; drag to set velocity; scale selected notes proportionally.
- **Complexity:** S
- **Model:** Haiku 5.5, medium effort (follows the patterns T5.3b sets)

#### T5.4 Undo/redo
- **PRD:** §6.3
- **Depends on:** T0.2
- **Deliverables:** command-pattern history covering note edits, track changes and patch changes ("Set it up" too); coalesce continuous drags into one entry; Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z; history limit 200.
- **Acceptance:** property test: random edit sequence then full undo returns to the initial state exactly.
- **Complexity:** M
- **Model:** Sonnet 5.5, medium effort

#### T5.5 Recording from the keyboard
- **PRD:** §6.4
- **Depends on:** T5.2, T3.1
- **Deliverables:** record arm per track (one armed at a time); count-in; captures note on/off from the event bus with audio-clock timestamps converted to ticks (compensating for output latency); optional input quantise (off, 1/8, 1/16); overdub into existing notes; recording stops cleanly closing open notes; one undo step per take.
- **Acceptance:** notes played on the beat land within 10 ms (unquantised) of grid lines in a scripted test; quantise snaps correctly; loop recording handles notes held across the loop point.
- **Complexity:** L
- **Model:** Sonnet 5.5, high effort

#### T5.6 Track list and arrangement overview
- **PRD:** §6.2
- **Depends on:** T5.1
- **Deliverables:** track headers (name, colour, preset selector, volume, mute, solo, arm, edit sound); miniature note view per track along a shared timeline; drag to reorder; shown in the Composition tab (T2.7).
- **Complexity:** M
- **Model:** Sonnet 5.5, medium effort

#### T5.7 Persistence
- **PRD:** §6.5
- **Depends on:** T5.1
- **Deliverables:** debounced autosave to IndexedDB; restore on load; save/open/export project JSON (validated, versioned, with migration hook); "new project" with confirmation.
- **Acceptance:** reload restores identical state; importing an invalid file shows a clear error and changes nothing.
- **Complexity:** S
- **Model:** Haiku 5.5, medium effort

---

### Phase 6 — Quality and release

#### T6.1 Accessibility pass
- **PRD:** §7.4
- **Depends on:** phases 2–5
- **Deliverables:** keyboard traversal order; focus visibility; ARIA on all controls, drawer and piano roll (piano roll gets a list-based alternative view of notes for screen readers); WCAG 2.2 AA contrast; reduced motion.
- **Complexity:** M
- **Model:** Sonnet 5.5, medium effort

#### T6.2 Performance profiling and fixes
- **PRD:** §7.4
- **Depends on:** phases 1, 2, 5
- **Deliverables:** measured latency, capacity (8×8), UI frame time and memory over a 30-minute session; fixes for anything over budget; results table in `docs/performance.md`.
- **Complexity:** M
- **Model:** Sonnet 5.5, high effort. A human runs the live benchmark on an M1 MacBook Air; the agent cannot reach that hardware.

#### T6.3 Cross-browser end-to-end suite
- **PRD:** §7.4
- **Depends on:** phases 2–5
- **Deliverables:** Playwright flows on Chromium, Firefox, WebKit: start audio, play notes, change every section, open help, build a 2-track loop, save and reload; known-difference notes (e.g. `cancelAndHoldAtTime` fallback in Firefox).
- **Complexity:** M
- **Model:** Sonnet 5.5, medium effort

#### T6.4 PWA, bundle budget and deploy
- **PRD:** §7.1, §7.4
- **Depends on:** all
- **Deliverables:** service worker with offline support; bundle under 2 MB transferred (CI fails over budget); static deploy pipeline (e.g. Cloudflare Pages or Netlify); version shown in the UI.
- **Complexity:** S
- **Model:** Haiku 5.5, low effort

### Phase 7 — Serum-based colour theme (later)

The current look is functional but plain. These tasks restyle the app with the colour theme of Xfer Records' Serum 2 (PRD §2.1). They do not change behaviour, registry or engine. They are lowest priority, but they only need T2.7, so they can run alongside later waves (section 4a).

**Reference palette.** Sampled (October 2026) from the official Serum 2 screenshot on Xfer's product page ([Xfer Records: Serum 2](https://www.xferrecords.com/products/serum-2), image `serum2_promo-….png`, 2380×1480). Values are the most common pixel colours in each region, rounded down to multiples of 4, so treat them as ±4 per channel.

| Role in Serum 2 | Colour | Use in Synth Lab |
| --- | --- | --- |
| Darkest background: tab buttons, lower panels, preset bar | `#181c20` | page background, tab bar, top bar |
| Panel backgrounds | `#202428`, `#242c30` | section frames, drawer, macro-like areas |
| Display backgrounds (oscillator and filter displays) | `#1c282c` to `#283434` | scope, spectrum, filter/envelope/LFO plots |
| Slate control strip and section headers | `#8090a0` (lighter `#90a4b4`) | knob areas and section headers, with dark text |
| Main accent: filter, envelopes, LFO paths, preset name | cyan `#00b0f0` to `#30c4fc` | cutoff, envelope and LFO traces, links, focus ring, modulation |
| Selected tab | deep blue `#005c8c` | selected tab, selected segment, pressed toggle |
| Oscillator on-lights and waveforms | green `#70b040`, lime `#90e050` | oscillator and sound-source accents, "on" LEDs, scope trace |
| Current wavetable frame | yellow `#f0f000` | playhead, current-position markers, envelope dots |
| Arpeggiator | purple `#a45cf4` | recording arm and record state (Phase 5) |
| White keys | pale blue-grey `#c0d4e4` to `#cce0f0` | on-screen white keys |

Not sampled: text colours. Serum shows near-white text on the dark panels and dark text on the slate strips; pick exact values in T7.1 so every pairing passes AA.

#### T7.1 Serum-based theme tokens
- **Deliverables:** replace the dark theme's colour tokens in `src/ui/theme/theme.css` with the palette above, mapped role by role (the "Use in Synth Lab" column).
- **Keep the light theme.** Re-map it to the same roles: Serum's accents on a light background (for example a pale grey page, white panels, slate-tinted control strips), darkening each accent where needed so it passes AA on white.
- Theme selection: follow the OS (`prefers-color-scheme`) by default, as today; add a System / Light / Dark setting in the top bar (a `Select` from the control kit, with a help entry) that sets `data-theme`. The choice is remembered per viewer in `localStorage`.
- Accent per role, as in Serum: green for sources, cyan for filter and modulation, deep blue for selection, yellow for position, purple for recording.
- Add the new pairings to the WCAG 2.2 AA tests in `theme.test.ts`, for both themes: text on each background, dark text on slate, white text on deep blue, accents on the display background, the focus ring on every background.
- Only colours are adopted: no Serum logo, wordmark, artwork or bitmap control graphics.
- **Acceptance:** all contrast tests pass for both themes; the System / Light / Dark setting is keyboard-operable and survives a reload; the canvases (scope, spectrum, plots, diagrams) read their colours from the new tokens and redraw when the theme changes; a screenshot of each tab is saved in `docs/`, with a link to the Serum reference (do not copy Xfer's image into the repo).
- **Complexity:** S
- **Model:** Sonnet 5.5, medium effort

#### T7.2 Section and panel styling
- **Deliverables:** slate control strips under each section's knobs and dark display wells behind the plots, as in Serum; section headers in slate with dark text; knob caps and value arcs in the role accent; toggles with green "on" LEDs; the selected tab and segment in deep blue; the on-screen keyboard's white keys in pale blue-grey.
- **Acceptance:** layout snapshot test still passes; no text drops below AA contrast; reduced-motion disables any animated effect.
- **Complexity:** M
- **Model:** Sonnet 5.5, medium effort

#### T7.3 Visual review against the reference
- **Deliverables:** compare every tab, the help drawer and the output strip with the Serum reference screenshot (dark theme), and check that the light theme keeps the same role colours; list and fix colour mismatches and contrast problems; record before/after screenshots of both themes in `docs/`.
- **Acceptance:** a human reviews both themes on a real screen at 1280 px and signs them off.
- **Complexity:** S
- **Model:** Haiku 5.5, low effort

---

## 6. Summary table

| ID | Task | Complexity | Status | Model | Effort | Wave |
| --- | --- | --- | --- | --- | --- | --- |
| T0.1 | Scaffold | S | done | Sonnet 5.5 | — | — |
| T0.2 ★ | Contracts and parameter registry | M | done | Sonnet 5.5 | — | — |
| T0.3 | UI component kit | M | done | Sonnet 5.5 | — | — |
| T1.1 | Audio context and master chain | S | done | Sonnet 5.5 | — | — |
| T1.2 ★ | Voice graph and envelopes | XL | done | Sonnet 5.5 | — | — |
| T1.3 ★ | Pulse oscillator worklet | L | done | Sonnet 5.5 | — | — |
| T1.4 ★ | Voice allocator and glide | L | done | Sonnet 5.5 | — | — |
| T1.5 | LFO and modulation | M | done | Sonnet 5.5 | — | — |
| T1.6 | Effects chain | M | done | Sonnet 5.5 | — | — |
| T1.7 | Engine assembly and binding | M | done | Sonnet 5.5 | — | — |
| T1.8 | Audio test harness | M | done | Sonnet 5.5 | — | — |
| T2.1 | Panel layout | M | done | Sonnet 5.5 | — | — |
| T2.2 | Section panels | M | done | Sonnet 5.5 | — | — |
| T2.3 | Scope, spectrum, meter | M | done | Sonnet 5.5 | — | — |
| T2.4 | Per-section plots | M | done | Sonnet 5.5 | — | — |
| T2.5a | Teaching preset sound design | M | done | Sonnet 5.5 | — | — |
| T2.5b | Preset storage and menu | S | done | Sonnet 5.5 | — | — |
| T3.1 | Laptop keyboard input | M | done | Sonnet 5.5 | — | — |
| T3.2 | On-screen keyboard | S | done | Sonnet 5.5 | — | — |
| T4.1 | Help drawer and navigation | M | done | Sonnet 5.5 | — | — |
| T4.2 | Help content pipeline | S | done | Sonnet 5.5 | — | — |
| T4.3 | Try this and A/B | S | done | Sonnet 5.5 | — | — |
| T4.4a | Section help entries | L | done | Sonnet 5.5 | — | — |
| T4.4b | Control entries and glossary | M | done | Sonnet 5.5 | — | — |
| T4.5 | Animated concept diagrams | M | done | Sonnet 5.5 | — | — |
| T2.6 ★ | Editable numeric readouts | S | done (★ review open) | Sonnet 5.5 | medium | 1 |
| T2.7 ★ | Fixed-viewport tabbed layout | M | done (★ review open) | Sonnet 5.5 | high | 1 |
| T5.1 | Project state and multi-track audio | M | done | Sonnet 5.5 | high | 1 |
| T5.4 | Undo/redo | M | done | Sonnet 5.5 | medium | 1 |
| T5.2 ★ | Sequencer scheduler and transport | L | done (review pending) | Sonnet 5.5 | high | 2 |
| T5.3a | Piano roll rendering | M | to do | Sonnet 5.5 | high | 2 |
| T5.6 | Track list | M | to do | Sonnet 5.5 | medium | 2 |
| T5.7 | Persistence | S | to do | Haiku 5.5 | medium | 2 |
| T5.3b ★ | Piano roll editing | XL | to do | Sonnet 5.5 | high | 3 |
| T5.5 | Recording | L | to do | Sonnet 5.5 | high | 3 |
| T5.3c | Velocity lane | S | to do | Haiku 5.5 | medium | 4 |
| T4.7 | Help content update | S | to do | Sonnet 5.5 | medium | 4 |
| T6.1 | Accessibility | M | to do | Sonnet 5.5 | medium | 5 |
| T6.2 | Performance | M | to do | Sonnet 5.5 | high | 5 |
| T6.3 | Cross-browser e2e | M | to do | Sonnet 5.5 | medium | 5 |
| T6.4 | PWA and deploy | S | to do | Haiku 5.5 | low | 5 |
| T7.1 | Serum-based theme tokens | S | to do | Sonnet 5.5 | medium | 6 |
| T7.2 | Section and panel styling | M | to do | Sonnet 5.5 | medium | 6 |
| T7.3 | Visual review against the reference | S | to do | Haiku 5.5 | low | 6 |
| T4.6 ★ | Accuracy review (independent + human) | M | to do | Sonnet 5.5, then a human | high | — |

★ = needs a fresh-context review by a Sonnet 5.5 reviewer (high effort) before merge.

Remaining work: 20 items, 16 on Sonnet 5.5 and 4 on Haiku 5.5. No task uses Claude Opus.

---

## 7. Milestone mapping to the PRD

| PRD milestone (§8.1) | Tasks | Exit check |
| --- | --- | --- |
| 1. Sound engine | T0.1, T0.2, T1.1, T1.2, T1.4, minimal T3.1 | Poly notes from laptop keys, no clicks, latency < 30 ms |
| 2. Full synth panel | T0.3, T1.3, T1.5–T1.8, T2.1–T2.5 | Every control works and is smoothed; one-track capacity met |
| 3. Keyboard | T3.1, T3.2 | Works on QWERTY, AZERTY, QWERTZ |
| 4. Educational layer | T4.1–T4.6 | Content check passes; reviews done |
| 5. Composition tool | T5.1–T5.7 | 8-track, 16-bar loop plays with no drift or dropouts |
| 6. Beta and polish | T6.1–T6.4 | PRD §8.2 success measures |

---

## 8. Key risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Envelope retrigger and release edge cases cause clicks or stuck notes | High — core sound quality | T1.2 offline click detector; T1.4 fuzz test; reviewer agent |
| Browser differences in Web Audio (Firefox lacks some automation methods; Safari worklet quirks) | Medium | Fallback paths in T1.2; cross-browser e2e from Phase 1, not only at the end |
| Sequencer timing drift under UI load | High — composer unusable | Worker-based timer, audio-clock scheduling (T5.2); long-run drift test |
| Piano-roll interaction complexity balloons | Medium — schedule | Split into T5.3a/b/c; command stack first; fixed v1 tool set |
| Help content inaccurate | High — undermines the product's purpose | Content check in CI; independent fresh-context Sonnet review; human expert sign-off (T4.6) |
| Contract churn between parallel agents | Medium | T0.2 locked after merge; changes only via orchestrator |
| Laptop key ghosting confuses users | Low | Explained in keyboard help entry (PRD §5.3) |
