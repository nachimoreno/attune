// Paint — wet pigment mixing itself in slow motion; with the fire palette
// it reads as rising waves of flame. Built on layered domain warping
// (noise displaced by noise displaced by noise). Bass churns the paint,
// kicks flush heat through it and push the colour toward the next stop,
// snares splash fine turbulence across the surface, hats barely shimmer.
// Colours come from the shared palette system, cycling like the particles.

import { QuadScene } from '../renderer.js';
import { PALETTES } from '../palettes.js';

const FRAG = `
uniform vec3 uStops[4];
uniform float uNStops;
uniform float uPhase;
uniform vec3 uBg;

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * snoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v * 0.5 + 0.5;
}

vec3 palSample(float u) {
  u = mod(u, uNStops);
  float i0 = floor(u);
  float f = u - i0;
  f = f * f * (3.0 - 2.0 * f);
  vec3 a = uStops[int(i0)];
  vec3 b = uStops[int(mod(i0 + 1.0, uNStops))];
  return mix(a, b, f);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float t = uTime * (0.05 + uP2 * 0.12);
  vec2 p = uv * 1.6 + vec2(0.0, -t * 1.2); // slow upward wash — waves rise

  // bass churns the paint; the kick flushes a surge of stir through it
  float churn = (0.8 + uP1 * 2.6) * (1.0 + uBass * 0.9 + uKick * 0.5);

  vec2 q = vec2(fbm(p + t * 0.9),
                fbm(p + vec2(5.2, 1.3) - t * 0.7));
  vec2 r = vec2(fbm(p + churn * q + vec2(1.7, 9.2) + t * 0.45),
                fbm(p + churn * q + vec2(8.3, 2.8) - t * 0.35));
  // snare splash: fine fast turbulence stirred in for the accent
  r += uSnare * 0.35 * vec2(snoise(p * 3.0 + t * 4.0),
                            snoise(p * 3.0 - t * 4.0));
  float f = fbm(p + churn * r);

  // the field spans ~1.5 adjacent stops — two pigments mixing at a time,
  // with the cycle phase sliding which pair; kicks push toward the hotter
  float u = uPhase + f * 1.6 + uKick * 0.6 + uBright * 0.4;
  vec3 ink = palSample(u);

  // steep tone curve: troughs go dark, crests flare
  float fs = smoothstep(0.18, 0.92, f);
  float lum = pow(fs, 2.0 + (1.0 - uLoud) * 1.0);
  float v = lum * (0.85 + uLoud * 0.7 + uKick * 0.5);
  // folds where the warp shears hardest get veined with the neighbouring
  // colour — two pigments interleaving, not one paint brightening
  float ridge = pow(clamp(length(r - q) * 0.9, 0.0, 1.0), 3.0);
  vec3 vein = palSample(u + 1.2);

  vec3 col = uBg + ink * v
           + vein * ridge * (0.2 + uSnare * 0.35 + uKick * 0.15);
  col += ink.bgr * uHihat * 0.06;
  col += (hash21(gl_FragCoord.xy + uTime) - 0.5) * 0.012;
  outColor = vec4(col, 1.0);
}
`;

export class PaintScene extends QuadScene {
  constructor() {
    super({
      name: 'paint',
      title: 'paint',
      frag: FRAG,
      macros: [
        { key: 'churn', label: 'churn', value: 0.6 },
        { key: 'drift', label: 'drift', value: 0.5 },
        { key: 'cycle', label: 'cycle', value: 0.55 },
      ],
    });
    this.palettes = PALETTES;
    this.paletteIndex = 0;
    this.cyclePhase = 0;
    this.background = [0.012, 0.008, 0.01];
    this.stopBuf = new Float32Array(12);
    this.bgBuf = new Float32Array(3);
  }

  init(gl, quadVao) {
    super.init(gl, quadVao);
    this.locStops = gl.getUniformLocation(this.prog, 'uStops');
    this.locN = gl.getUniformLocation(this.prog, 'uNStops');
    this.locPhase = gl.getUniformLocation(this.prog, 'uPhase');
    this.locBg = gl.getUniformLocation(this.prog, 'uBg');
  }

  setUniforms(gl, state) {
    super.setUniforms(gl, state);
    const cyc = this.macros[2].value;
    this.cyclePhase += state.dt / (12 - cyc * 10);
    const pal = this.palettes[this.paletteIndex];
    this.stopBuf.fill(0);
    this.stopBuf.set(pal.stops);
    this.bgBuf.set(this.background);
    gl.uniform3fv(this.locStops, this.stopBuf);
    gl.uniform1f(this.locN, pal.stops.length / 3);
    gl.uniform1f(this.locPhase, this.cyclePhase);
    gl.uniform3fv(this.locBg, this.bgBuf);
  }
}

export const paint = new PaintScene();
