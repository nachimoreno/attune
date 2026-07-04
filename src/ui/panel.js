// Control rack: every tuning control carries its own live meter, so the
// slider you drag and the signal it shapes are one object.

import { SIGNAL_COLORS } from './scope.js';
import { infoDot } from './tooltip.js';

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

// every slider shows its live value in real units (fmt maps the raw 0..1
// slider position to display text) and carries an (i) explaining the knob
function slider(labelText, value, oninput, { fmt = v => v.toFixed(2), info } = {}) {
  const label = document.createElement('label');
  const head = el('div', 'param-head', label);
  const span = el('span', null, head);
  span.textContent = labelText;
  if (info) head.appendChild(infoDot(info));
  const out = el('output', 'param-val', head);
  const input = el('input', null, label);
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.value = String(value);
  out.textContent = fmt(value);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    oninput(v);
    out.textContent = fmt(v);
  });
  return label;
}

// slider position 0..1 → milliseconds 60..600 (log)
const msOf = v => 60 * Math.pow(10, v);
const msTo = ms => Math.log10(ms / 60);
const fmtMs = v => Math.round(msOf(v)) + 'ms';
const fmtX = v => '×' + (v * 2).toFixed(2);
const fmtPct = v => Math.round(v * 100) + '%';

// what each control actually does — surfaced through the (i) dots
const INFO = {
  signal: {
    kick: 'onset detector on the low band (30–120 Hz) — fires on kick-drum '
      + 'hits; each hit is a punch that jumps and decays, scenes ride it as the pulse',
    snare: 'onset detector that needs a simultaneous rise in snare body '
      + '(180–450 Hz) AND crack (2–4.5 kHz), so hi-hats and kick thumps are rejected — the accent channel',
    hihat: 'onset detector on the high band (6–14 kHz): hi-hats, shakers, '
      + 'cymbal ticks — kept subordinate in the house style',
    bass: 'energy in 30–250 Hz, normalized against the track\'s own running '
      + 'average so every mix lands in 0–1 — scenes read it as continuous weight',
    mid: 'energy in 250 Hz–2 kHz — vocals, chords, leads — normalized to the '
      + 'track itself, smoothed into a continuous level',
    treble: 'energy in 2–6 kHz: presence, not air — hi-hats and cymbal wash '
      + 'live in the hihat detector instead, so they can\'t own this level',
  },
  amt: name => `output level: scenes receive ${name} × amt, so 0 removes ${name} `
    + 'from the visuals entirely (the LED keeps showing raw detection)',
  sens: 'how easily a hit registers — low passes only the hardest hits, high '
    + 'is a hair trigger; the very bottom switches the detector off',
  decay: 'ring-out time of each hit: short is a tight flash, long is a washy '
    + 'pulse that carries into the next beat',
  gain: 'scales the band level before soft-clipping — above ×1.00 pushes it '
    + 'toward the top of its range, below leaves headroom',
  smooth: 'fall time after the band quiets down; rises always stay fast so '
    + 'hits still land on time',
  monitor: 'playback volume only — the engine analyses the signal before this '
    + 'gain, so quiet monitoring changes nothing in the visuals',
  quality: 'render resolution of the active scene (each scene keeps its own) — '
    + 'lower it if frames drop; paint holds up even very low',
  reactivity: 'blends every signal between the scene\'s natural idle motion (0) '
    + 'and full audio response (1) — LEDs and bpm stay live throughout',
  backdrop: 'the scene\'s clear colour, the canvas everything else is drawn '
    + 'over — × resets to the scene default',
};

// quality slider 0..1 ↔ render scale. The floor is deliberately low: paint
// holds up heavily downscaled, and at 0.2 the framebuffer is ~1/25 the pixels.
const Q_MIN = 0.2;
const scaleOf = v => Q_MIN + (1 - Q_MIN) * v;
const scaleTo = s => Math.max(0, Math.min(1, (s - Q_MIN) / (1 - Q_MIN)));

export class Panel {
  constructor({ tuning, engine, renderer, onScene }) {
    this.tuning = tuning;
    this.engine = engine;
    this.renderer = renderer;
    this.onScene = onScene;
    this.meters = {};   // signal name → { fill, led?, val }

    this.buildDetectors();
    this.buildLevels();
    this.buildScenes();
    this.bindInput();
  }

  signalRow(parent, name, hasLed, sliders) {
    const row = el('div', 'sig-row', parent);
    const head = el('div', 'sig-head', row);
    let led = null;
    if (hasLed) led = el('div', 'led', head);
    const nm = el('div', 'sig-name', head);
    nm.textContent = name;
    if (INFO.signal[name]) head.appendChild(infoDot(INFO.signal[name]));
    el('div', 'sig-spacer', head);
    const val = el('div', 'sig-val', head);
    val.textContent = '0.00';
    const pair = el('div', 'slider-pair', row);
    for (const s of sliders) pair.appendChild(s);
    const meter = el('div', 'meter', row);
    const fill = el('div', 'meter-fill', meter);
    fill.style.background = `rgb(${SIGNAL_COLORS[name]})`;
    this.meters[name] = { fill, led, val, color: SIGNAL_COLORS[name] };
  }

  buildDetectors() {
    const host = document.getElementById('detector-rows');
    for (const name of ['kick', 'snare', 'hihat']) {
      const t = this.tuning[name];
      this.signalRow(host, name, true, [
        slider('amt', t.amt, v => { t.amt = v; }, { info: INFO.amt(name) }),
        slider('sens', t.sens, v => { t.sens = v; }, { info: INFO.sens }),
        slider('decay', msTo(t.decay), v => { t.decay = msOf(v); },
          { fmt: fmtMs, info: INFO.decay }),
      ]);
    }
  }

  buildLevels() {
    const host = document.getElementById('level-rows');
    for (const name of ['bass', 'mid', 'treble']) {
      const t = this.tuning[name];
      this.signalRow(host, name, false, [
        slider('gain', t.gain / 2, v => { t.gain = v * 2; },
          { fmt: fmtX, info: INFO.gain }),
        slider('smooth', msTo(t.release), v => { t.release = msOf(v); },
          { fmt: fmtMs, info: INFO.smooth }),
      ]);
    }
  }

  buildScenes() {
    const tabs = document.getElementById('scene-tabs');
    const macroHost = document.getElementById('scene-macros');
    this.sceneButtons = [];
    this.renderer.scenes.forEach((scene, i) => {
      if (scene.hidden) return;
      const b = el('button', null, tabs);
      b.type = 'button';
      b.textContent = scene.title;
      b.addEventListener('click', () => this.onScene(i));
      this.sceneButtons.push({ b, i });
    });
    this.renderMacros = () => {
      macroHost.textContent = '';
      const scene = this.renderer.active;
      for (const m of scene.macros) {
        const row = el('div', 'macro-row', macroHost);
        const s = el('span', null, row);
        s.textContent = m.label;
        if (m.info) row.appendChild(infoDot(m.info));
        const input = el('input', null, row);
        input.type = 'range';
        input.min = '0';
        input.max = '1';
        input.step = '0.01';
        input.value = String(m.value);
        const out = el('output', 'macro-val', row);
        out.textContent = m.value.toFixed(2);
        input.addEventListener('input', () => {
          m.value = parseFloat(input.value);
          out.textContent = m.value.toFixed(2);
        });
      }
      if (scene.background) {
        const row = el('div', 'macro-row bg-row', macroHost);
        const s = el('span', null, row);
        s.textContent = 'backdrop';
        row.appendChild(infoDot(INFO.backdrop));
        const input = el('input', null, row);
        input.type = 'color';
        const toHex = c => '#' + c.map(v =>
          Math.round(v * 255).toString(16).padStart(2, '0')).join('');
        const defaultBg = [...scene.background];
        input.value = toHex(scene.background);
        input.addEventListener('input', () => {
          scene.background = [1, 3, 5].map(k =>
            parseInt(input.value.slice(k, k + 2), 16) / 255);
        });
        const reset = el('button', 'bg-reset', row);
        reset.type = 'button';
        reset.title = 'reset backdrop';
        reset.textContent = '×';
        reset.addEventListener('click', () => {
          scene.background = [...defaultBg];
          input.value = toHex(defaultBg);
        });
      }
      if (scene.palettes) {
        const row = el('div', 'btn-row pal-row', macroHost);
        scene.palettes.forEach((p, i) => {
          const b = el('button', 'pal-btn', row);
          b.type = 'button';
          b.title = p.name;
          b.setAttribute('aria-label', `palette: ${p.name}`);
          b.style.background = `linear-gradient(90deg, ${p.css.join(', ')})`;
          b.classList.toggle('active', i === scene.paletteIndex);
          b.addEventListener('click', () => {
            scene.paletteIndex = i;
            for (const sib of row.children) sib.classList.remove('active');
            b.classList.add('active');
          });
        });
      }
      this.sceneButtons.forEach(({ b, i }) =>
        b.classList.toggle('active', i === this.renderer.activeIndex));
      this.syncQuality();
    };
    this.renderMacros();
  }

  // pull the quality slider to the active scene's render scale (scenes carry
  // their own; the slider is shared, so it re-reads on every scene switch)
  syncQuality() {
    if (!this.qualityInput) return; // bindInput runs after the first renderMacros
    const scale = this.renderer.active.renderScale ?? 1;
    this.qualityInput.value = String(scaleTo(scale));
    this.qualityVal.textContent = Math.round(scale * 100) + '%';
  }

  bindInput() {
    const $ = id => document.getElementById(id);
    this.btnPlay = $('btn-play');
    this.trackName = $('track-name');
    this.bpmReadout = $('bpm-readout');
    this.srcButtons = { demo: $('btn-demo'), mic: $('btn-mic'), file: $('btn-file') };

    $('btn-demo').addEventListener('click', () => this.engine.useDemo());
    $('btn-mic').addEventListener('click', () =>
      this.engine.useMic().catch(err => {
        this.trackName.textContent = 'mic unavailable — check permissions';
        console.error(err);
      }));
    const fileInput = $('file-input');
    $('btn-file').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) this.engine.loadFile(fileInput.files[0]);
    });
    this.btnPlay.addEventListener('click', () => this.engine.toggle());
    // the fixed rows live in index.html; their (i) dots slot in after the name
    for (const [id, info] of [['vol', INFO.monitor], ['quality', INFO.quality],
      ['react', INFO.reactivity]]) {
      $(id).parentElement.querySelector('span').after(infoDot(info));
    }
    const volOut = $('vol-val');
    $('vol').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      this.engine.setVolume(v);
      volOut.textContent = fmtPct(v);
    });
    // quality: sets the *active* scene's render scale, so each scene keeps its
    // own resolution (paint low, particles native) and the slider follows the
    // scene you're on — syncQuality() re-reads it on every scene switch.
    this.qualityInput = $('quality');
    this.qualityVal = $('quality-val');
    this.qualityInput.addEventListener('input', e => {
      const scale = scaleOf(parseFloat(e.target.value));
      this.renderer.setRenderScale(scale);
      this.qualityVal.textContent = Math.round(scale * 100) + '%';
    });
    this.syncQuality();
    const reactVal = $('react-val');
    $('react').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      this.tuning.master.reactivity = v;
      reactVal.textContent = v.toFixed(2);
    });

    this.engine.onChange = () => this.syncTransport();
  }

  syncTransport() {
    const e = this.engine;
    this.trackName.textContent = e.trackName || 'no input';
    this.btnPlay.disabled = e.mode === 'none' || e.mode === 'mic';
    this.btnPlay.textContent = e.playing ? 'pause' : 'play';
    for (const [mode, btn] of Object.entries(this.srcButtons)) {
      btn.classList.toggle('active', e.mode === mode);
    }
    document.getElementById('hint').classList.toggle('gone', e.mode !== 'none');
  }

  // called every frame; the meter shows what scenes receive (post-amount),
  // the LED shows raw detection — so at amt 0 you still see it firing
  update(signals) {
    for (const [name, m] of Object.entries(this.meters)) {
      const v = signals[name];
      m.fill.style.transform = `scaleX(${v.toFixed(3)})`;
      m.val.textContent = v.toFixed(2);
      if (m.led) {
        const raw = signals[name + 'Raw'] ?? v;
        const glow = Math.min(raw * 1.4, 1);
        m.led.style.background = glow > 0.05
          ? `rgba(${m.color}, ${glow})`
          : 'var(--faint)';
        m.led.style.boxShadow = glow > 0.4
          ? `0 0 ${6 * glow}px rgba(${m.color}, ${glow * 0.8})`
          : 'none';
      }
    }
    if (signals.bpm > 0 && signals.beatConf > 0.25) {
      this.bpmReadout.innerHTML = `${signals.bpm.toFixed(0)} <em>bpm</em>`;
      this.bpmReadout.classList.toggle('locked', signals.beatConf > 0.55);
    } else {
      this.bpmReadout.innerHTML = '— <em>bpm</em>';
      this.bpmReadout.classList.remove('locked');
    }
  }
}
