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
uniform float uSpan;
uniform float uWide; // 1 = full palette: pigment fills the field, no black
uniform float uFloor; // full mode: brightness of the dimmest pigment
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

  // bass churns the paint; the kick flushes a surge of stir through it.
  // the base floor keeps churn 0 an almost-laminar wash — the knob's low
  // quarter is where the calm settings live
  float churn = (0.09 + uP1 * 1.91) * (1.0 + uBass * 0.9 + uKick * 0.5);

  vec2 q = vec2(fbm(p + t * 0.9),
                fbm(p + vec2(5.2, 1.3) - t * 0.7));
  vec2 r = vec2(fbm(p + churn * q + vec2(1.7, 9.2) + t * 0.45),
                fbm(p + churn * q + vec2(8.3, 2.8) - t * 0.35));
  // snare splash: fine fast turbulence stirred in for the accent
  r += uSnare * 0.35 * vec2(snoise(p * 3.0 + t * 4.0),
                            snoise(p * 3.0 - t * 4.0));
  float f = fbm(p + churn * r);

  // the field spans uSpan stops: ~1.5 for the two-pigments-at-a-time mix
  // (the cycle phase slides which pair), or trough-to-crest across the whole
  // palette for full ones. fbm bunches around mid-range, so full palettes
  // contrast-stretch the colour coordinate — without it the frame only shows
  // a stop and a half and the cycle drifts it back to one-colour-on-black.
  // kicks push toward the hotter
  float fc = mix(f, smoothstep(0.22, 0.78, f), uWide);
  float u = uPhase + fc * uSpan + uKick * 0.6 + uBright * 0.4;
  vec3 ink = palSample(u);

  // steep tone curve: troughs go dark, crests flare. Full palettes relax it
  // and keep a pigment floor — troughs stay dim colour (the red body under
  // yellow crests) instead of dropping to black
  float fs = smoothstep(0.18, 0.92, f);
  float lum = pow(fs, mix(2.0 + (1.0 - uLoud), 1.2 + (1.0 - uLoud) * 0.4, uWide));
  lum = mix(lum, uFloor + (1.0 - uFloor) * lum, uWide);
  float v = lum * (0.85 + uLoud * 0.7 + uKick * 0.5);
  // dim pigment deepens into its own saturated self instead of scaling
  // toward black — darkened yellow reads olive-green, but squared it stays
  // golden, so a stop fading out keeps its vividness (full palettes only)
  ink *= mix(ink, vec3(1.0), max(lum, 1.0 - uWide));
  // folds where the warp shears hardest get veined with the neighbouring
  // colour — two pigments interleaving, not one paint brightening
  float ridge = pow(clamp(length(r - q) * 0.9, 0.0, 1.0), 3.0);
  vec3 vein = palSample(u + uSpan * 0.75);

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
        { key: 'churn', label: 'churn', value: 0.2,
          info: 'how turbulently the pigment folds into itself — the low '
            + 'quarter is a calm laminar wash; bass and kicks stir it harder' },
        { key: 'drift', label: 'drift', value: 0.5,
          info: 'base speed of the upward wash — how fast the paint field '
            + 'flows on its own, before the music moves it' },
        { key: 'cycle', label: 'cycle', value: 0.55,
          info: 'palette cycling speed — 0 is ~12s per colour stop, 1 is ~2s; '
            + 'kicks push the colour toward the hotter stop' },
      ],
    });
    // the pigment field is fragment-heavy and reads well slightly soft, so it
    // ships at half internal resolution (the quality slider retunes it live)
    this.renderScale = 0.5;
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
    this.locSpan = gl.getUniformLocation(this.prog, 'uSpan');
    this.locWide = gl.getUniformLocation(this.prog, 'uWide');
    this.locFloor = gl.getUniformLocation(this.prog, 'uFloor');
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
    // full: trough-to-crest covers every stop exactly once (n-1 intervals)
    gl.uniform1f(this.locSpan, pal.full ? pal.stops.length / 3 - 1 : 1.6);
    gl.uniform1f(this.locWide, pal.full ? 1 : 0);
    gl.uniform1f(this.locFloor, pal.floor ?? 0.35);
    gl.uniform3fv(this.locBg, this.bgBuf);
  }
}

export const paint = new PaintScene();
