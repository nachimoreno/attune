// Colour palettes for particle-style scenes. Stops are chosen for additive
// blending on a near-black field — nothing too dark to read as light.
// Scenes cycle through the stops over time, holding each colour briefly
// and cross-fading between them.

function pal(name, hexes, opts) {
  const stops = new Float32Array(hexes.length * 3);
  hexes.forEach((h, i) => {
    stops[i * 3] = parseInt(h.slice(0, 2), 16) / 255;
    stops[i * 3 + 1] = parseInt(h.slice(2, 4), 16) / 255;
    stops[i * 3 + 2] = parseInt(h.slice(4, 6), 16) / 255;
  });
  return { name, stops, css: hexes.map(h => '#' + h), ...opts };
}

// `full: true` — paint spreads every stop across the field at once instead
// of mixing two adjacent stops; `floor` — how bright paint's dimmest pigment
// stays in full mode (default 0.35; near 1 keeps the background light).
// Scenes that don't know the flags ignore them.
// blood stays narrow on purpose: one colour surging against black
export const PALETTES = [
  pal('fire', ['ff3810', 'ff8c1a', 'ffd166', 'd92038'], { full: true }),
  pal('neon', ['2f6bff', '00e5ff', 'ff2fb3', '8c3fff'], { full: true }),
  pal('blue + amber', ['3f7dff', 'ffb454'], { full: true }),
  pal('ocean', ['0d5d8c', '1cc3ae', '86f3d7', '2a80e8'], { full: true }),
  pal('blood', ['c40e26', 'ff1f3d', '8a0a1d', 'ff4060']),
  // dreamsdemos.com brand tokens: paper → peach-200 → coral-300 (primary) →
  // coral-500 (the site's grad-coral endpoint — 600 reads too heavy when the
  // cycle rotates it into the background); coral waves over a white field
  pal('dreamsdemos', ['ffffff', 'ffd9c2', 'ffaaa8', 'ff8b88'],
    { full: true, floor: 0.85 }),
];
