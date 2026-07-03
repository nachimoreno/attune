// Tunnel — kaleidoscopic tube whose travel is locked to the beat clock
// (uBeats advances 1.0 per detected beat), so motion stays in step with the
// music instead of just drifting. Kicks fire an expanding pulse ring.

import { QuadScene } from '../renderer.js';

const FRAG = `
vec3 pal(float t, float shift) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67) + shift));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float seg = floor(mix(4.0, 14.0, uP1));
  float a = atan(uv.y, uv.x);
  float r = length(uv);
  float sa = 6.28318 / seg;
  a = abs(mod(a, sa) - sa * 0.5);

  float depth = 0.25 / (r + 0.07);
  float travel = uBeats * (0.35 + uP2 * 0.9);
  float z = depth + travel;

  float bands = 0.5 + 0.5 * sin(z * 6.28318);
  bands = pow(bands, 2.0 + 9.0 * (1.0 - uMid * 0.8));
  float spokes = 0.5 + 0.5 * sin(a * seg * 2.0 + z * 4.0);
  spokes = pow(spokes, 3.0);

  float ripple = snoise(vec2(z * 1.5, a * 3.0)) * uSnare * 0.6;

  vec3 base = pal(z * 0.13 + uBright * 0.15, uP3);
  vec3 col = base * bands * (0.2 + uLoud * 0.65 + uBass * 0.45);
  col += base.bgr * spokes * (0.08 + uMid * 0.3 + uSnare * 0.35);
  col += base * ripple;

  // kick pulse: a ring expanding outward once per beat
  float rp = 0.12 + fract(uBeats) * 1.3;
  float ring = exp(-pow((r - rp) * 8.0, 2.0)) * uKick;
  col += vec3(0.9, 0.92, 1.0) * ring * 0.8;

  // hats sparkle the far center
  col += base * uHihat * exp(-r * 4.0) * 0.5;

  col *= 0.25 + 0.75 * smoothstep(1.9, 0.35, r);
  col += (hash21(gl_FragCoord.xy + uTime) - 0.5) * 0.02;
  outColor = vec4(col, 1.0);
}
`;

export const tunnel = new QuadScene({
  name: 'tunnel',
  title: 'tunnel',
  frag: FRAG,
  macros: [
    { key: 'segments', label: 'segments', value: 0.5 },
    { key: 'speed', label: 'speed', value: 0.4 },
    { key: 'hue', label: 'hue', value: 0.0 },
  ],
});
