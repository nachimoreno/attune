# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

Vanilla ES modules, zero dependencies, no package.json — there is no build, lint, or test tooling. ES modules require HTTP (not `file://`):

```sh
python3 -m http.server 8420   # → http://localhost:8420
```

Then drop an audio file anywhere, press `D` for the demo beat, or `M` for mic. `space` play/pause, `1–2` switch scene, `H` hide panel. For a quick syntax check without a browser, copy a module to a `.mjs` file and run `node --check` on it.

Do not verify visual changes with headless-browser screenshots — it wastes time and the renders aren't representative. Apply the change, syntax-check the touched modules, and stop; the user runs the app and reports how it looks.

## Architecture

The core design principle (enforce it in every change): **visuals never see the raw spectrum.** `src/audio/features.js` turns FFT frames into a small set of named signals, and scenes only ever receive those: `kick/snare/hihat` (onset punches, decaying envelopes), `bass/mid/treble` (levels self-normalized against the track's own running average), `loud`, `bright` (spectral centroid), `bpm/beatPhase/beatConf`, plus `*Raw` and `*Fired` detection metadata for LEDs and the beat clock.

Data flow, one frame (`src/main.js` frame loop):

1. `AudioEngine` (`src/audio/engine.js`) — one AudioContext, one analyser, three interchangeable sources (decoded file / mic / synthesized demo beat). Analysis taps the graph **before** the monitor gain, so volume never affects visuals; mic is analyzed but never played back (feedback).
2. `FeatureExtractor.update()` reads the analyser and produces the signal set, shaped by the live-mutated `tuning` object (`defaultTuning()` shape; the panel writes into it directly — there is no event system).
3. Reactivity blend: signals are mixed toward a fixed idle baseline so the scene keeps breathing at reactivity 0; detection metadata passes through untouched.
4. `Renderer.render()` draws the active scene; `Scope` and `Panel.update()` visualize what the engine hears.

### Scenes (`src/gl/`)

Two kinds, both registered in the `Renderer` constructor call in `main.js`:

- **QuadScene** (`renderer.js`): fullscreen fragment shader. The scene supplies only a fragment `main()`; `FRAG_PRELUDE` provides the audio uniforms (`uKick`, `uBass`, `uBeats`, …), macro params `uP1–uP3`, and noise helpers (`snoise`, `hash21`, `hsv2rgb`). Subclass and extend `setUniforms` for extra uniforms (see `paint.js`).
- **Custom** (`particles.js`): implements `init(gl, quadVao)` / `draw(gl, state)` itself. Its simulation lives in a pure `step()` with no GL calls, deliberately testable headlessly.

Scene contract: exactly **three** macros (`{ key, label, value, info }` — `info` feeds the panel's (i) tooltip). Optional opt-in properties the panel reacts to: `palettes`/`paletteIndex` (swatch row; palettes live in `src/gl/palettes.js`, one line to add one), `background` (backdrop color picker), `renderScale` (per-scene internal resolution; the quality slider writes it), `hidden` (compiled but absent from tabs/keys; reachable via `?scene=N`, 1-based).

### Deprecated scenes — do not touch

**Ferro and tunnel are deprecated (see BACKLOG.md). Never modify them unless explicitly asked.** When a change fans out across scenes (macros, uniforms, palettes), apply it to particles and paint only, and make shared code degrade gracefully when the deprecated scenes lack new fields.

## House style / invariants

- Visuals are led by bass and kick (smooth pulses), accented by snares; hi-hats stay subordinate and `amt: 0` must remove a channel from the visuals *entirely* (LEDs keep showing raw detection).
- The treble level is presence (2–6 kHz), deliberately stopping below hi-hat territory; 6 kHz+ exists only inside the hihat detector. Snare detection requires body (180–450 Hz) AND crack (2–4.5 kHz) rising together so hi-hat bleed can't phantom-fire it.
- Signal colors encode frequency region everywhere (CSS vars, scope, meters): amber = lows, rose = mids, cyan = highs.
- Never `await audioCtx.resume()` — the promise can stay pending forever without a user gesture (e.g. drag & drop before any click). Use `AudioEngine.resumeSoon()`: fire-and-forget plus retry on the next gesture; sources scheduled on a suspended context start when it resumes.
- The rack panel has `backdrop-filter`, which makes it a containing block for `position: fixed` descendants — overlays like the shared tooltip (`src/ui/tooltip.js`) must be appended to `<body>`.
- The panel mutates `tuning` and scene macro values in place; meters/LEDs are driven per-frame by `Panel.update(signals)`, not by change events.
