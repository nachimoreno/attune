# attune — music visualization engine

A real-time music visualizer built around one idea: **visuals should respond
to musical events, not to the raw spectrum.** Instead of mapping FFT bins to
pixels, an analysis layer turns audio into a small set of meaningful,
*tunable* signals, and the generators only ever see those.

## Run it

ES modules need HTTP (not `file://`):

```sh
python3 -m http.server 8420
# → http://localhost:8420
```

Then drop an audio file anywhere, press `D` for the built-in demo beat, or
`M` for the microphone.

## How it listens

`src/audio/features.js` is the engine's ear:

- **Onset detectors (kick / snare / hat)** — per-band spectral flux (only
  *rising* energy counts, so a sustained bassline doesn't fire the kick
  channel) compared against an adaptive threshold, with a refractory period.
  Each detector has `amt` (how much of it the visuals receive — 0 removes
  the channel from the equation entirely, while the LED keeps showing raw
  detection), `sens` (threshold; 0 disables detection), and `decay` (how
  long the visual punch rings out). Snare detection requires a simultaneous
  rise in both the body (180–450 Hz) and crack (2–4.5 kHz) bands with real
  body energy, so hi-hat bleed can't phantom-fire it.
- **Band levels (bass / mid / treble)** — energy normalized against a slow
  running average of the track itself, so the engine self-calibrates to any
  mix, then shaped by `gain` (0 = kill) and `smooth` (release time). The
  treble band is *presence* (2–6 kHz), deliberately stopping below hi-hat
  territory — 6 kHz+ exists only inside the hihat detector.
- **Beat clock** — inter-onset-interval histogram → BPM + beat phase, which
  scenes use to phase-lock motion (the tunnel travels exactly one unit per
  beat).
- **Brightness** — spectral centroid, steers hue.
- **Reactivity** — global blend between the scene's natural idle motion (0)
  and full audio response (1). Detection LEDs and the bpm readout ignore it,
  so you can always see what the engine hears underneath.

The scope in the panel shows the spectrum (amber = lows, rose = mids,
cyan = highs), the centroid marker, and the kick detector's flux trace with
its threshold line — so you can *see* what it hears while you tune.

## Scenes

Two active generators: **particles** (reactive swarm + drifter layer) and
**paint** (domain-warped pigment field — waves of fire with the fire
palette). Ferro and tunnel are deprecated but still compiled: see
`BACKLOG.md`; reach them at `?scene=3` / `?scene=4`.

## Palettes

Both active scenes colour from preset palettes (fire, neon, blue + amber,
ocean — the swatch row under the generator macros). Colours cycle
continuously: each stop holds, then slowly cross-fades into the next, and
the `cycle` macro sets the pace (~2–12 s per colour). Palettes live in
`src/gl/palettes.js`; add one line there to add your own.

## Keys

`space` play/pause · `D` demo beat · `M` mic · `1–2` scene · `H` hide panel

## Adding a scene

Scenes receive the same signal set. For a shader scene, copy
`src/gl/scenes/paint.js`: write a fragment `main()` against the uniforms in
`FRAG_PRELUDE` (`uKick`, `uBass`, `uBeats`, macro params `uP1–uP3`, …),
declare three macros, and register it in `src/main.js`. Subclass
`QuadScene.setUniforms` for custom uniforms, and declare `palettes` /
`background` properties to opt into the swatch row and backdrop picker.
