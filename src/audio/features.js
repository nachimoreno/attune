// Feature extraction: turns a raw FFT frame into musically meaningful signals.
//
// The design principle: visuals should never see the spectrum. They see
// *events* (kick / snare / hat onsets, detected via per-band spectral flux
// against an adaptive threshold) and *envelopes* (band levels normalized
// against a running average of the track itself, so a bass-heavy mix and a
// thin acoustic recording both land in the same 0..1 range).

const TWO = 2;

function freqRange(sampleRate, fftSize, lo, hi) {
  const hz = sampleRate / fftSize;
  const a = Math.max(1, Math.round(lo / hz));
  const b = Math.min(fftSize / 2 - 1, Math.max(a + 1, Math.round(hi / hz)));
  return [a, b];
}

// exponential-moving-average coefficient for a given time constant
function ema(dt, tauSec) {
  return 1 - Math.exp(-dt / tauSec);
}

class BandTracker {
  constructor(range) {
    this.range = range;       // [binStart, binEnd)
    this.energy = 0;          // raw band amplitude this frame
    this.avg = 1e-4;          // adaptive normalization reference (slow EMA)
    this.level = 0;           // normalized, smoothed 0..1 output
    this.flux = 0;            // raw positive spectral difference this frame
    this.fluxAvg = 1e-6;      // running flux reference
    this.fluxN = 0;           // flux / fluxAvg (≈1 means "nothing new")
  }

  measure(mag, prevMag, dt) {
    const [a, b] = this.range;
    let e = 0, fl = 0;
    for (let i = a; i < b; i++) {
      const m = mag[i];
      e += m * m;
      const d = m - prevMag[i];
      if (d > 0) fl += d;
    }
    this.energy = Math.sqrt(e / (b - a));
    this.flux = fl / (b - a);

    this.avg += (this.energy - this.avg) * ema(dt, 4.0);
    if (this.avg < 1e-5) this.avg = 1e-5;
    this.fluxAvg += (this.flux - this.fluxAvg) * ema(dt, 2.5);
    if (this.fluxAvg < 1e-7) this.fluxAvg = 1e-7;
    this.fluxN = this.flux / this.fluxAvg;
  }

  // gain-scaled, soft-clipped, attack/release-smoothed level
  smoothLevel(dt, gain, releaseMs) {
    const raw = Math.tanh((this.energy / (this.avg * 2.2)) * gain);
    const tau = raw > this.level
      ? Math.min(releaseMs * 0.15, 40) / 1000
      : releaseMs / 1000;
    this.level += (raw - this.level) * ema(dt, Math.max(tau, 0.004));
    return this.level;
  }
}

class OnsetDetector {
  constructor(refractoryMs) {
    this.refractory = refractoryMs / 1000;
    this.lastFire = -10;
    this.punch = 0;           // envelope: jumps on onset, decays exponentially
    this.fired = false;       // true only on the frame an onset landed
    this.ratio = 0;           // fluxN / threshold, for the scope
  }

  // sens 0..1 → threshold ~3.8 (strict) .. ~1.2 (hair trigger);
  // sens at the floor disables the detector entirely
  update(fluxN, energy, t, dt, sens, decayMs) {
    const thr = 1.2 * Math.pow(3.2, 1 - sens);
    this.ratio = fluxN / thr;
    this.fired = false;
    const enabled = sens > 0.02;
    if (enabled && fluxN > thr && energy > 1e-4 && t - this.lastFire > this.refractory) {
      const strength = Math.min((fluxN / thr - 1) * 1.2, 1);
      this.punch = Math.max(this.punch, 0.55 + 0.45 * strength);
      this.lastFire = t;
      this.fired = true;
    }
    this.punch *= Math.exp(-dt / (decayMs / 1000));
    if (this.punch < 1e-3) this.punch = 0;
    return this.punch;
  }
}

// Tempo from inter-onset intervals: histogram of gaps between recent onsets,
// folded into 70..170 bpm. Phase re-anchors on onsets that agree with the grid.
class BeatClock {
  constructor() {
    this.onsets = [];         // { t, w }
    this.period = 0.5;
    this.bpm = 0;
    this.confidence = 0;
    this.anchor = 0;
  }

  push(t, w) {
    this.onsets.push({ t, w });
    const cutoff = t - 9;
    while (this.onsets.length && this.onsets[0].t < cutoff) this.onsets.shift();
    if (this.onsets.length >= 4) this.estimate(t);
  }

  estimate(now) {
    const os = this.onsets;
    const binW = 0.01;
    const nBins = Math.round(1.2 / binW);
    const hist = new Float32Array(nBins);
    let total = 0;
    for (let i = 0; i < os.length; i++) {
      for (let j = i + 1; j < os.length; j++) {
        const gap = os[j].t - os[i].t;
        if (gap < 0.24 || gap > 1.2) continue;
        const w = os[i].w * os[j].w;
        const bin = Math.round(gap / binW);
        for (let k = -2; k <= 2; k++) {
          const b = bin + k;
          if (b >= 0 && b < nBins) hist[b] += w / (1 + Math.abs(k));
        }
        total += w;
      }
    }
    if (total < 0.5) return;
    let best = 0, bestScore = 0;
    for (let b = 0; b < nBins; b++) {
      if (hist[b] > bestScore) { bestScore = hist[b]; best = b; }
    }
    let period = best * binW;
    if (period < 0.2) return;
    let bpm = 60 / period;
    while (bpm < 70) { bpm *= 2; period /= 2; }
    while (bpm >= 170) { bpm /= 2; period *= 2; }
    this.period = period;
    this.bpm = bpm;
    this.confidence = Math.min(bestScore / (total * 0.6), 1);
    // re-anchor phase if this onset sits near the predicted grid
    const last = os[os.length - 1].t;
    const ph = ((last - this.anchor) / period) % 1;
    if (ph < 0.15 || ph > 0.85 || this.confidence < 0.3) this.anchor = last;
  }

  phase(t) {
    if (!this.bpm) return 0;
    const p = ((t - this.anchor) / this.period) % 1;
    return p < 0 ? p + 1 : p;
  }
}

export class FeatureExtractor {
  constructor(sampleRate, fftSize) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    const n = fftSize / 2;
    this.freqDb = new Float32Array(n);   // filled by caller from the analyser
    this.wave = new Float32Array(fftSize);
    this.mag = new Float32Array(n);
    this.prevMag = new Float32Array(n);

    const R = (lo, hi) => freqRange(sampleRate, fftSize, lo, hi);
    this.bands = {
      kick: new BandTracker(R(30, 120)),
      snareBody: new BandTracker(R(180, 450)),
      snareCrack: new BandTracker(R(2000, 4500)),
      hihat: new BandTracker(R(6000, 14000)),
      bass: new BandTracker(R(30, 250)),
      mid: new BandTracker(R(250, 2000)),
      // presence, not air: stops above 6 kHz so hi-hats and cymbal wash
      // don't own this level — they only exist in the hihat detector band
      treble: new BandTracker(R(2000, 6000)),
    };

    this.detectors = {
      kick: new OnsetDetector(130),
      snare: new OnsetDetector(130),
      hihat: new OnsetDetector(55),
    };

    this.clock = new BeatClock();
    this.loudAvg = 1e-4;
    this.centroidRange = R(100, 10000);

    // history rings for the scope: kick detector ratio + fire flags
    this.histLen = 140;
    this.fluxHist = new Float32Array(this.histLen);
    this.fireHist = new Uint8Array(this.histLen);
    this.histHead = 0;

    this.signals = {
      kick: 0, snare: 0, hihat: 0,
      kickRaw: 0, snareRaw: 0, hihatRaw: 0,
      bass: 0, mid: 0, treble: 0,
      loud: 0, bright: 0,
      bpm: 0, beatPhase: 0, beatConf: 0,
      kickFired: false, snareFired: false, hihatFired: false,
    };
  }

  update(t, dt, tuning) {
    const n = this.mag.length;
    const mag = this.mag, prev = this.prevMag, db = this.freqDb;

    for (let i = 0; i < n; i++) {
      const d = db[i];
      mag[i] = d < -160 || !isFinite(d) ? 0 : Math.pow(10, d / 20);
    }

    for (const key in this.bands) this.bands[key].measure(mag, prev, dt);

    const B = this.bands, D = this.detectors, S = this.signals;

    // --- levels ---
    S.bass = B.bass.smoothLevel(dt, tuning.bass.gain, tuning.bass.release);
    S.mid = B.mid.smoothLevel(dt, tuning.mid.gain, tuning.mid.release);
    S.treble = B.treble.smoothLevel(dt, tuning.treble.gain, tuning.treble.release);

    // --- transient detectors ---
    // raw = detection activity (for LEDs / beat clock); the signal scenes
    // receive is raw × amount, so amount = 0 removes a channel entirely
    S.kickRaw = D.kick.update(B.kick.fluxN, B.kick.energy, t, dt,
      tuning.kick.sens, tuning.kick.decay);
    // snare = simultaneous rise in body AND crack; min() rejects hi-hats
    // (crack only) and kick thumps (body only). The energy gate is body-only:
    // real snares always carry 180–450 Hz, hi-hat bleed never does.
    const snareFluxN = Math.min(B.snareBody.fluxN, B.snareCrack.fluxN);
    const snareEnergy = B.snareBody.energy;
    S.snareRaw = D.snare.update(snareFluxN, snareEnergy, t, dt,
      tuning.snare.sens, tuning.snare.decay);
    S.hihatRaw = D.hihat.update(B.hihat.fluxN, B.hihat.energy, t, dt,
      tuning.hihat.sens, tuning.hihat.decay);
    S.kick = S.kickRaw * tuning.kick.amt;
    S.snare = S.snareRaw * tuning.snare.amt;
    S.hihat = S.hihatRaw * tuning.hihat.amt;
    S.kickFired = D.kick.fired;
    S.snareFired = D.snare.fired;
    S.hihatFired = D.hihat.fired;

    // --- overall loudness (time domain RMS, self-normalizing) ---
    let rms = 0;
    for (let i = 0; i < this.wave.length; i += TWO) {
      const v = this.wave[i];
      rms += v * v;
    }
    rms = Math.sqrt(rms / (this.wave.length / TWO));
    this.loudAvg += (rms - this.loudAvg) * ema(dt, 4.0);
    if (this.loudAvg < 1e-5) this.loudAvg = 1e-5;
    S.loud = Math.tanh(rms / (this.loudAvg * 1.8));

    // --- spectral centroid → brightness 0..1 (log-frequency scale) ---
    const [ca, cb] = this.centroidRange;
    let num = 0, den = 0;
    const hz = this.sampleRate / this.fftSize;
    for (let i = ca; i < cb; i++) { num += i * hz * mag[i]; den += mag[i]; }
    if (den > 1e-6) {
      const c = num / den;
      const b = Math.log2(c / 200) / Math.log2(8000 / 200);
      // slow: hue is a mood, and fast centroid jumps (hi-hats) must not strobe it
      S.bright += (Math.min(Math.max(b, 0), 1) - S.bright) * ema(dt, 0.7);
    }

    // --- tempo ---
    if (S.kickFired) this.clock.push(t, 1.0);
    if (S.snareFired) this.clock.push(t, 0.7);
    S.bpm = this.clock.bpm;
    S.beatPhase = this.clock.phase(t);
    S.beatConf = this.clock.confidence;

    // --- scope history ---
    this.fluxHist[this.histHead] = D.kick.ratio;
    this.fireHist[this.histHead] = D.kick.fired ? 1 : 0;
    this.histHead = (this.histHead + 1) % this.histLen;

    prev.set(mag);
    return S;
  }
}

// defaults follow the house style: led by kick and bass, accented by
// snares, hi-hats present but subordinate (amt 0 removes them completely)
export const defaultTuning = () => ({
  // global blend between the scene's natural idle motion (0) and full
  // audio response (1); applied in the main loop, after extraction
  master: { reactivity: 1 },
  kick: { amt: 1.0, sens: 0.5, decay: 260 },
  snare: { amt: 0.9, sens: 0.5, decay: 200 },
  hihat: { amt: 0.35, sens: 0.5, decay: 100 },
  bass: { gain: 1, release: 250 },
  mid: { gain: 1, release: 200 },
  treble: { gain: 0.8, release: 200 },
});
