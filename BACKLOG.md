# Backlog

Particles and paint are the active scenes; these are parked, not planned.
Ferro and tunnel are hidden from the UI (`hidden = true` in `src/main.js`)
but still compiled — reach them at `?scene=3` (ferro) and `?scene=4`
(tunnel) for development.

## Ferro (deprioritized 2026-07-03 — "not looking great")

- Visual quality pass: murky at idle, rim light reads weak, blob mass too
  undifferentiated. Consider proper SDF normals instead of screen-space
  derivatives, brighter specular hierarchy, more distinct blob separation.
- Adopt the palette system from particles (`src/gl/palettes.js`) for the rim
  light instead of the `hue` macro.

## Tunnel (deprioritized 2026-07-03)

- Visual pass: default look too uniformly magenta; ring pulse could be
  sharper; explore depth fog for a stronger sense of travel.
- Adopt the palette system for the color base instead of cosine-palette
  `hue` shifting.

## Engine ideas (no priority)

- Mapping matrix: route any signal to any scene parameter with per-route gain.
- Preset save/load for tunings + scene settings (localStorage or JSON export).
- System-audio capture guidance (BlackHole loopback on macOS).
