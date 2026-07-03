// Colour palettes for particle-style scenes. Stops are chosen for additive
// blending on a near-black field — nothing too dark to read as light.
// Scenes cycle through the stops over time, holding each colour briefly
// and cross-fading between them.

function pal(name, hexes) {
  const stops = new Float32Array(hexes.length * 3);
  hexes.forEach((h, i) => {
    stops[i * 3] = parseInt(h.slice(0, 2), 16) / 255;
    stops[i * 3 + 1] = parseInt(h.slice(2, 4), 16) / 255;
    stops[i * 3 + 2] = parseInt(h.slice(4, 6), 16) / 255;
  });
  return { name, stops, css: hexes.map(h => '#' + h) };
}

export const PALETTES = [
  pal('fire', ['ff3810', 'ff8c1a', 'ffd166', 'd92038']),
  pal('neon', ['2f6bff', '00e5ff', 'ff2fb3', '8c3fff']),
  pal('blue + amber', ['3f7dff', 'ffb454']),
  pal('ocean', ['0d5d8c', '1cc3ae', '86f3d7', '2a80e8']),
];
