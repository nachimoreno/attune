// Ferro — glossy black metaball fluid. Kicks grow noise-driven spikes on the
// contour (the ferrofluid "magnet on" moment), bass swells the body, snares
// flash counter-phase spikes and the rim light; hats only faintly shimmer.

import { QuadScene } from '../renderer.js';

const FRAG = `
float field(vec2 uv, float t, out float wob) {
  float f = 0.0;
  wob = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float sp = 0.14 + 0.09 * fract(fi * 0.618);
    float ph = fi * 2.399;
    vec2 c = vec2(cos(t * sp * 2.1 + ph), sin(t * sp * 1.63 + ph * 1.31));
    c *= (0.34 + 0.22 * sin(fi * 1.3 + t * 0.21)) * (1.0 + uBass * 0.38);
    vec2 d = uv - c;
    f += (0.045 + 0.02 * sin(fi * 1.7 + t * 0.5)) / (dot(d, d) + 1e-4);
    wob += sin(fi + t);
  }
  return f;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float t = uTime * (0.25 + uP2 * 0.9);

  float wob;
  float f = field(uv, t, wob);

  // angular spikes: modulate the iso level by noise around the origin
  vec2 dir = normalize(uv + vec2(1e-4));
  float n1 = snoise(dir * (2.0 + uP1 * 5.0) + vec2(uTime * 0.35, -uTime * 0.22));
  float n2 = snoise(dir * 9.0 - vec2(uTime * 0.7, uTime * 0.4));
  float spike = uKick * uP1;
  f *= 1.0 + spike * 0.55 * pow(max(n1, 0.0), 1.4)
           + uSnare * 0.35 * max(-n1, 0.0)
           + uHihat * 0.08 * n2;

  float lf = log(max(f, 1e-4));
  float e = fwidth(f) * 1.5 + 1e-4;
  float mask = smoothstep(1.0 - e, 1.0 + e, f);

  // fake shading from the field gradient (log-field keeps it uniform)
  vec2 g = vec2(dFdx(lf), dFdy(lf));
  vec3 N = normalize(vec3(-g * 26.0, 1.0));
  vec3 L = normalize(vec3(0.5, 0.7, 0.6));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 48.0);
  float fres = pow(1.0 - max(N.z, 0.0), 2.0);

  float hue = fract(uP3 + uBright * 0.22);
  vec3 rim = hsv2rgb(vec3(hue, 0.72, 1.0));

  vec3 blob = vec3(0.016, 0.017, 0.02) * (0.35 + 0.65 * diff)
            + spec * vec3(0.85, 0.87, 0.9) * (0.5 + uLoud * 0.6)
            + fres * rim * (0.15 + 0.35 * uMid + 0.3 * uTreble + 0.25 * uSnare);

  float glow = pow(clamp(f, 0.0, 1.0), 3.0);
  vec3 bg = vec3(0.010, 0.011, 0.014)
          + rim * glow * (0.04 + uMid * 0.10)
          + rim * uKick * 0.02;

  vec3 col = mix(bg, blob, mask);
  col += (hash21(gl_FragCoord.xy + uTime) - 0.5) * 0.015;
  outColor = vec4(col, 1.0);
}
`;

export const ferro = new QuadScene({
  name: 'ferro',
  title: 'ferro',
  frag: FRAG,
  macros: [
    { key: 'spike', label: 'spike', value: 0.7 },
    { key: 'flow', label: 'flow', value: 0.4 },
    { key: 'hue', label: 'hue', value: 0.55 },
  ],
});
