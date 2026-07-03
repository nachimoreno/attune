// Particles — a swarm anchored to slowly rotating home positions. Bass
// swells the wind, kicks throw a radial impulse through the cloud, snares
// twist it sideways, hats (if given any amount) flicker individual
// particles. CPU sim, GPU point sprites.
//
// Two populations: the swarm (reacts hard, evacuates the center on kicks —
// that's the hole) and a small drifter layer that barely feels the
// shockwave and glides on slow Lissajous paths crossing the middle, so the
// hole always has a few quiet travelers in its background.
//
// Stability contract: impulses fire only on an envelope's rising edge
// (bounded energy per hit), and positions continuously relax toward home
// (τ ≈ 0.35 s) — so back-to-back pulses can never accumulate displacement
// past a fixed bound. The cloud always recovers before the next beat.

import { compile } from '../renderer.js';
import { PALETTES } from '../palettes.js';

const N = 8000;
const DRIFTERS = 1000;  // particles 0..DRIFTERS-1 form the ambient layer
const STRETCH = 1.7;    // widescreen x-stretch, applied after home rotation
                        // so the cloud's long axis never swings vertical
const RELAX_DRIFT = 0.7; // drifters follow their moving targets lazily
const RELAX = 2.8;      // 1/s, position pull toward home
const DRAG = 3.0;       // 1/s, velocity decay
const KICK_IMPULSE = 3.0;
const SNARE_IMPULSE = 2.4;
const WIND = 3.2;

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;   // normalized space, y in [-1,1]
layout(location=1) in float aSize;
layout(location=2) in vec3 aCol;
uniform float uAspect;
uniform float uPixels;             // canvas height in device px
out vec3 vCol;
void main() {
  gl_Position = vec4(aPos.x / uAspect, aPos.y, 0.0, 1.0);
  gl_PointSize = aSize * uPixels / 900.0;
  vCol = aCol;
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 vCol;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  outColor = vec4(vCol * a * a, 1.0);
}`;


export class ParticleScene {
  constructor() {
    this.name = 'particles';
    this.title = 'particles';
    this.macros = [
      { key: 'impulse', label: 'impulse', value: 0.7 },
      { key: 'flow', label: 'flow', value: 0.5 },
      { key: 'cycle', label: 'cycle', value: 0.6 },
    ];
    this.palettes = PALETTES;
    this.paletteIndex = 0;
    this.cyclePhase = 0;
    // clear colour; panel shows a picker for scenes that declare this.
    // additive blending wants it dark — light values wash the particles out
    this.background = [0.012, 0.013, 0.017];
    this.pos = new Float32Array(N * 2);
    this.vel = new Float32Array(N * 2);
    this.home = new Float32Array(N * 2);
    this.seed = new Float32Array(N);
    // drifter orbit parameters: frequencies, phases, amplitudes
    this.orbF = new Float32Array(DRIFTERS * 2);
    this.orbP = new Float32Array(DRIFTERS * 2);
    this.orbA = new Float32Array(DRIFTERS * 2);
    this.attrib = new Float32Array(N * 6); // x, y, size, r, g, b
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.85;
      this.home[i * 2] = Math.cos(a) * r; // circular; stretched in step()
      this.home[i * 2 + 1] = Math.sin(a) * r;
      this.seed[i] = Math.random();
      this.pos[i * 2] = this.home[i * 2] * STRETCH;
      this.pos[i * 2 + 1] = this.home[i * 2 + 1];
    }
    for (let i = 0; i < DRIFTERS; i++) {
      // incommensurate slow frequencies → paths sweep across the center
      this.orbF[i * 2] = 0.05 + Math.random() * 0.09;
      this.orbF[i * 2 + 1] = 0.04 + Math.random() * 0.08;
      this.orbP[i * 2] = Math.random() * Math.PI * 2;
      this.orbP[i * 2 + 1] = Math.random() * Math.PI * 2;
      this.orbA[i * 2] = 0.12 + Math.random() * 0.73;
      this.orbA[i * 2 + 1] = 0.12 + Math.random() * 0.68;
    }
    this.prevKick = 0;
    this.prevSnare = 0;
    this.theta = 0; // slow rotation of the home cloud
  }

  // pure simulation step — no GL, testable headlessly
  step(t, dt, s) {
    const [imp, flow, cyc] = this.macros.map(m => m.value);

    // rising edge of the envelopes = the hit itself; the tail is just ring-out
    const kickRise = Math.max(0, s.kick - this.prevKick);
    const snareRise = Math.max(0, s.snare - this.prevSnare);
    this.prevKick = s.kick;
    this.prevSnare = s.snare;
    const kickPush = kickRise * imp * KICK_IMPULSE;
    const snareTwist = snareRise * imp * SNARE_IMPULSE;

    const wind = flow * (0.25 + s.bass * 0.7 + s.treble * 0.2) * WIND;
    const drag = Math.exp(-dt * DRAG);
    const relax = Math.exp(-dt * RELAX);
    const relaxD = Math.exp(-dt * RELAX_DRIFT);
    this.theta += dt * (0.04 + s.loud * 0.06);
    const cosT = Math.cos(this.theta), sinT = Math.sin(this.theta);

    // palette cycling: one stop per `stopPeriod` seconds; brightness of the
    // music nudges the whole cloud a little further along the cycle
    const stops = this.palettes[this.paletteIndex].stops;
    const nStops = stops.length / 3;
    const stopPeriod = 12 - cyc * 10; // cyc 0 → 12 s per colour, 1 → 2 s
    this.cyclePhase += dt / stopPeriod;
    const phase = this.cyclePhase + s.bright * 0.5;

    const pos = this.pos, vel = this.vel, home = this.home;
    const seed = this.seed, at = this.attrib;

    const orbF = this.orbF, orbP = this.orbP, orbA = this.orbA;

    for (let i = 0; i < N; i++) {
      const ix = i * 2, iy = ix + 1;
      const drifter = i < DRIFTERS;
      let x = pos[ix], y = pos[iy];

      // swirl angle from cheap layered waves — organic, no allocation
      const ang = Math.sin(x * 1.3 + t * 0.31 + seed[i] * 6.28) * 2.1
                + Math.sin(y * 1.9 - t * 0.23) * 2.1;
      const w = drifter ? wind * 0.5 : wind;
      vel[ix] += Math.cos(ang) * w * dt;
      vel[iy] += Math.sin(ang) * w * dt;

      // one-shot impulses: kick shoves outward, snare twists sideways,
      // both fading with distance like a shockwave losing energy;
      // drifters only feel a nudge, so the hole keeps its travelers
      if (kickPush > 0.001 || snareTwist > 0.001) {
        const d = Math.hypot(x, y) + 1e-4;
        const falloff = (drifter ? 0.15 : 1) / (1 + d * d * 0.8);
        vel[ix] += ((x / d) * kickPush + (-y / d) * snareTwist) * falloff;
        vel[iy] += ((y / d) * kickPush + (x / d) * snareTwist) * falloff;
      }

      vel[ix] *= drag;
      vel[iy] *= drag;
      x += vel[ix] * dt;
      y += vel[iy] * dt;

      let hx, hy, rlx;
      if (drifter) {
        // slow Lissajous target sweeping across the cloud interior
        hx = Math.cos(t * orbF[ix] + orbP[ix]) * orbA[ix] * STRETCH;
        hy = Math.sin(t * orbF[iy] + orbP[iy]) * orbA[iy];
        rlx = relaxD;
      } else {
        // this particle's (slowly rotating) home; rotate in circular
        // space, then stretch — the ellipse stays flat
        hx = (home[ix] * cosT - home[iy] * sinT) * STRETCH;
        hy = home[ix] * sinT + home[iy] * cosT;
        rlx = relax;
      }
      x = hx + (x - hx) * rlx;
      y = hy + (y - hy) * rlx;
      pos[ix] = x;
      pos[iy] = y;

      const speed = Math.hypot(vel[ix], vel[iy]);
      const flick = s.hihat * (0.5 + 0.5 * Math.sin(seed[i] * 43.7 + t * 26.0));
      const o = i * 6;
      at[o] = x;
      at[o + 1] = y;

      // palette colour: hold each stop, then ease into the next; seeds
      // spread the cloud across a slice of the cycle so the fade sweeps
      // visibly through it
      let u = (phase + seed[i] * 0.6) % nStops;
      const s0 = (u | 0) * 3;
      let f = (u - (u | 0) - 0.3) / 0.4;
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      f = f * f * (3 - 2 * f);
      const s1 = s0 + 3 < stops.length ? s0 + 3 : 0;
      let cr = stops[s0] + (stops[s1] - stops[s0]) * f;
      let cg = stops[s0 + 1] + (stops[s1 + 1] - stops[s0 + 1]) * f;
      let cb = stops[s0 + 2] + (stops[s1 + 2] - stops[s0 + 2]) * f;

      if (drifter) {
        // a touch larger, steadier, desaturated: quiet travelers
        at[o + 2] = (2.6 + seed[i] * 1.8) * (0.9 + s.loud * 0.3);
        const v = Math.min(0.32 + speed * 0.4 + s.kick * 0.08, 1);
        const l = cr * 0.35 + cg * 0.45 + cb * 0.2;
        at[o + 3] = (cr + (l - cr) * 0.35) * v;
        at[o + 4] = (cg + (l - cg) * 0.35) * v;
        at[o + 5] = (cb + (l - cb) * 0.35) * v;
      } else {
        at[o + 2] = (1.8 + seed[i] * 2.2) * (0.8 + s.loud * 0.6 + flick * 1.5);
        const v = Math.min(0.26 + speed * 0.7 + flick * 0.5 + s.kick * 0.3, 1);
        const w = flick * 0.35; // hats push sparkles toward white
        at[o + 3] = (cr * (1 - w) + w) * v;
        at[o + 4] = (cg * (1 - w) + w) * v;
        at[o + 5] = (cb * (1 - w) + w) * v;
      }
    }
  }

  init(gl) {
    this.prog = compile(gl, VERT, FRAG, 'particles');
    this.uAspect = gl.getUniformLocation(this.prog, 'uAspect');
    this.uPixels = gl.getUniformLocation(this.prog, 'uPixels');
    this.vbo = gl.createBuffer();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.attrib.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 24, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
  }

  draw(gl, state) {
    this.step(state.time, Math.min(state.dt, 0.05), state.signals);

    gl.useProgram(this.prog);
    gl.uniform1f(this.uAspect, state.width / state.height);
    gl.uniform1f(this.uPixels, state.height);
    const bg = this.background;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.attrib);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}
