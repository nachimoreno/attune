import { AudioEngine, FFT_SIZE } from './audio/engine.js';
import { FeatureExtractor, defaultTuning } from './audio/features.js';
import { Renderer } from './gl/renderer.js';
import { ParticleScene } from './gl/scenes/particles.js';
import { paint } from './gl/scenes/paint.js';
import { ferro } from './gl/scenes/ferro.js';
import { tunnel } from './gl/scenes/tunnel.js';
import { Panel } from './ui/panel.js';
import { Scope } from './ui/scope.js';

const errBox = document.getElementById('err');
function showError(msg) {
  errBox.hidden = false;
  errBox.textContent += (errBox.textContent ? '\n\n' : '') + msg;
}
window.addEventListener('error', e => showError(e.message));
window.addEventListener('unhandledrejection', e =>
  showError(String(e.reason && e.reason.message || e.reason)));

let renderer, engine, extractor, panel, scope, tuning;

// idle signals keep scenes breathing before any audio starts
const idle = {
  kick: 0, snare: 0, hihat: 0,
  kickRaw: 0, snareRaw: 0, hihatRaw: 0,
  bass: 0.18, mid: 0.12, treble: 0.08,
  loud: 0.15, bright: 0.4, bpm: 0, beatPhase: 0, beatConf: 0,
  kickFired: false, snareFired: false, hihatFired: false,
};

try {
  const canvas = document.getElementById('stage');
  // ferro + tunnel are deprecated (see BACKLOG.md): still compiled and
  // reachable via ?scene=3 / ?scene=4, but absent from tabs and keys
  ferro.hidden = true;
  tunnel.hidden = true;
  renderer = new Renderer(canvas, [new ParticleScene(), paint, ferro, tunnel]);
  engine = new AudioEngine();
  tuning = defaultTuning();
  panel = new Panel({
    tuning,
    engine,
    renderer,
    onScene: i => { renderer.setScene(i); panel.renderMacros(); },
  });
  const q = parseInt(new URLSearchParams(location.search).get('scene'), 10);
  if (q >= 1 && q <= renderer.scenes.length) {
    renderer.setScene(q - 1);
    panel.renderMacros();
  }
} catch (err) {
  showError(err.message);
  throw err;
}

// extractor + scope need the real sample rate, so they wait for the context
function ensureAnalysis() {
  if (!extractor && engine.ctx) {
    extractor = new FeatureExtractor(engine.ctx.sampleRate, FFT_SIZE);
    scope = new Scope(document.getElementById('scope'),
      engine.ctx.sampleRate, FFT_SIZE);
  }
  return extractor;
}

// reactivity: blend live signals toward the idle baseline, so turning the
// knob down fades to the scene's natural motion rather than below it.
// Detection metadata (raw punches, fired flags, tempo) passes through
// untouched — LEDs and the bpm readout keep showing what the engine hears.
const mixed = { ...idle };
function applyReactivity(live, r) {
  if (r >= 0.999) return live;
  for (const k of ['kick', 'snare', 'hihat', 'bass', 'mid', 'treble', 'loud', 'bright']) {
    mixed[k] = idle[k] + (live[k] - idle[k]) * r;
  }
  for (const k of ['kickRaw', 'snareRaw', 'hihatRaw', 'bpm', 'beatPhase', 'beatConf',
    'kickFired', 'snareFired', 'hihatFired']) {
    mixed[k] = live[k];
  }
  return mixed;
}

// beats: a clock that advances 1.0 per beat when tempo is locked,
// so scenes can phase-lock motion; free-runs at 120 bpm otherwise
let beats = 0;
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const t = now / 1000;

  let signals = idle;
  if (engine.active && ensureAnalysis()) {
    engine.analyser.getFloatFrequencyData(extractor.freqDb);
    engine.analyser.getFloatTimeDomainData(extractor.wave);
    const live = extractor.update(engine.ctx.currentTime, dt, tuning);
    signals = applyReactivity(live, tuning.master.reactivity);
  }

  const bpm = signals.bpm > 0 && signals.beatConf > 0.25 ? signals.bpm : 120;
  beats += dt * (bpm / 60);

  renderer.render(t, dt, signals, beats);
  if (scope) scope.draw(extractor, signals);
  panel.update(signals);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- keyboard ----------
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  switch (e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      engine.toggle();
      break;
    case 'd': engine.useDemo(); break;
    case 'm': panel.srcButtons.mic.click(); break;
    case 'h': document.getElementById('rack').classList.toggle('hidden'); break;
    case '1': case '2': case '3': {
      // number keys address visible scenes only
      const visible = renderer.scenes
        .map((s, i) => (s.hidden ? -1 : i))
        .filter(i => i >= 0);
      const idx = visible[parseInt(e.key, 10) - 1];
      if (idx !== undefined) {
        renderer.setScene(idx);
        panel.renderMacros();
      }
      break;
    }
  }
});

// ---------- drag & drop ----------
const veil = document.getElementById('drop-veil');
window.addEventListener('dragover', e => {
  e.preventDefault();
  veil.classList.add('on');
});
window.addEventListener('dragleave', e => {
  if (!e.relatedTarget) veil.classList.remove('on');
});
window.addEventListener('drop', e => {
  e.preventDefault();
  veil.classList.remove('on');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) {
    engine.loadFile(file).catch(err =>
      showError(`Could not decode "${file.name}": ${err.message || err}`));
  }
});
