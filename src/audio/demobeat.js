// Synthesized four-on-the-floor test pattern at 124 bpm.
// Ground truth for tuning: you know exactly where the kicks, snares and
// hats are, so you can verify the detectors fire in the right places.

const BPM = 124;
const STEP = 60 / BPM / 4; // sixteenth note
const LOOKAHEAD = 0.15;    // seconds scheduled ahead of the clock

// bass pattern in semitones above A1 (55 Hz), one entry per sixteenth; null = rest
const BASSLINE = [0, null, 0, null, 3, null, null, 0,
                  0, null, 0, null, 5, null, 3, null];

export class DemoBeat {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    this.out.connect(out);
    this.noise = this.makeNoise();
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  start() {
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
  }

  schedule() {
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % 32;
      this.nextTime += STEP;
    }
  }

  playStep(i, t) {
    const s = i % 16;
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.9 : 0.45);
    const note = BASSLINE[s];
    if (note !== null) this.bass(t, 55 * Math.pow(2, note / 12));
    if (i === 0) this.pad(t);
  }

  env(t, peak, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(this.out);
    return g;
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    o.connect(this.env(t, 1.0, 0.26));
    o.start(t); o.stop(t + 0.3);
  }

  snare(t) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    n.connect(hp);
    hp.connect(this.env(t, 0.5, 0.16));
    n.start(t); n.stop(t + 0.2);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 190;
    o.connect(this.env(t, 0.35, 0.1));
    o.start(t); o.stop(t + 0.12);
  }

  hat(t, vel) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8200;
    n.connect(hp);
    hp.connect(this.env(t, 0.22 * vel, 0.05));
    n.start(t); n.stop(t + 0.08);
  }

  bass(t, freq) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(this.env(t, 0.3, 0.2));
    o.start(t); o.stop(t + 0.22);
  }

  pad(t) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const g = this.ctx.createGain();
    const bar = STEP * 32;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.4);
    g.gain.setValueAtTime(0.05, t + bar - 0.6);
    g.gain.linearRampToValueAtTime(0, t + bar);
    lp.connect(g);
    g.connect(this.out);
    for (const semi of [0, 7, 12, 15]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 220 * Math.pow(2, semi / 12);
      o.detune.value = (Math.random() - 0.5) * 12;
      o.connect(lp);
      o.start(t); o.stop(t + bar);
    }
  }
}
