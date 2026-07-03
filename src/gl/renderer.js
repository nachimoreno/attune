// WebGL2 renderer. Scenes are either QuadScene (fullscreen fragment shader
// fed a standard set of audio uniforms) or custom (see particles.js).

const QUAD_VERT = `#version 300 es
layout(location=0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// every quad scene gets these + noise helpers, and appends its own main()
export const FRAG_PRELUDE = `#version 300 es
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uKick;
uniform float uSnare;
uniform float uHihat;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uLoud;
uniform float uBright;
uniform float uBeats;
uniform float uP1;
uniform float uP2;
uniform float uP3;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// 2D simplex noise (Ashima Arts / Ian McEwan, public domain)
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

const AUDIO_UNIFORMS = [
  'uRes', 'uTime', 'uKick', 'uSnare', 'uHihat', 'uBass', 'uMid',
  'uTreble', 'uLoud', 'uBright', 'uBeats', 'uP1', 'uP2', 'uP3',
];

export function compile(gl, vertSrc, fragSrc, label) {
  const mk = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`[${label}] shader compile:\n${gl.getShaderInfoLog(sh)}`);
    }
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`[${label}] link: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

export class QuadScene {
  constructor(def) {
    this.name = def.name;
    this.title = def.title;
    this.macros = def.macros; // [{ key, label, value }] → uP1..uP3
    this.fragBody = def.frag;
  }

  init(gl, quadVao) {
    this.vao = quadVao;
    this.prog = compile(gl, QUAD_VERT, FRAG_PRELUDE + this.fragBody, this.name);
    this.loc = {};
    for (const u of AUDIO_UNIFORMS) this.loc[u] = gl.getUniformLocation(this.prog, u);
  }

  draw(gl, state) {
    gl.useProgram(this.prog);
    this.setUniforms(gl, state);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // subclasses extend this to feed extra uniforms
  setUniforms(gl, state) {
    const L = this.loc, s = state.signals;
    gl.uniform2f(L.uRes, state.width, state.height);
    gl.uniform1f(L.uTime, state.time);
    gl.uniform1f(L.uKick, s.kick);
    gl.uniform1f(L.uSnare, s.snare);
    gl.uniform1f(L.uHihat, s.hihat);
    gl.uniform1f(L.uBass, s.bass);
    gl.uniform1f(L.uMid, s.mid);
    gl.uniform1f(L.uTreble, s.treble);
    gl.uniform1f(L.uLoud, s.loud);
    gl.uniform1f(L.uBright, s.bright);
    gl.uniform1f(L.uBeats, state.beats);
    gl.uniform1f(L.uP1, this.macros[0].value);
    gl.uniform1f(L.uP2, this.macros[1].value);
    gl.uniform1f(L.uP3, this.macros[2].value);
  }
}

export class Renderer {
  constructor(canvas, scenes) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.scenes = scenes;
    for (const s of scenes) s.init(gl, this.quadVao);
    this.activeIndex = 0;
    this.resize();
  }

  get active() { return this.scenes[this.activeIndex]; }

  setScene(i) {
    if (i >= 0 && i < this.scenes.length) this.activeIndex = i;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(time, dt, signals, beats) {
    this.resize();
    const gl = this.gl;
    const state = {
      time, dt, signals, beats,
      width: this.canvas.width,
      height: this.canvas.height,
    };
    gl.viewport(0, 0, state.width, state.height);
    this.active.draw(gl, state);
  }
}
