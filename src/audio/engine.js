// Audio plumbing: one AudioContext, one analyser, three interchangeable
// sources (decoded file, microphone, synthesized demo beat).
// Graph:  source → input ─→ analyser          (always)
//                        └→ monitor → master → speakers   (muted for mic)

import { DemoBeat } from './demobeat.js';

export const FFT_SIZE = 2048;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.mode = 'none';        // none | file | mic | demo
    this.onChange = () => {};

    // file playback state
    this.buffer = null;
    this.bufferSrc = null;
    this.trackName = '';
    this.startedAt = 0;
    this.pausedAt = 0;
    this.playing = false;

    this.micStream = null;
    this.micNode = null;
    this.demo = null;
  }

  async ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0; // we do our own smoothing
      this.input = this.ctx.createGain();
      this.monitor = this.ctx.createGain();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.input.connect(this.analyser);
      this.input.connect(this.monitor);
      this.monitor.connect(this.master);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.resumeSoon();
    return this.ctx;
  }

  // resume() can stay pending until the browser sees a user gesture (e.g. a
  // drag-and-drop load before any click), so never await it — that would
  // stall loadFile before the file is even decoded. Sources scheduled on a
  // suspended context start the moment it resumes; until then, retry on the
  // next gesture.
  resumeSoon() {
    this.ctx.resume();
    if (this.resumeArmed) return;
    this.resumeArmed = true;
    const retry = () => { this.ctx.resume(); };
    const disarm = () => {
      if (this.ctx.state === 'suspended') return;
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
      this.ctx.removeEventListener('statechange', disarm);
      this.resumeArmed = false;
    };
    window.addEventListener('pointerdown', retry);
    window.addEventListener('keydown', retry);
    this.ctx.addEventListener('statechange', disarm);
  }

  get active() {
    return this.mode !== 'none' && (this.mode !== 'file' || this.playing);
  }

  setVolume(v) {
    if (this.master) this.master.gain.value = v;
  }

  stopSource() {
    if (this.bufferSrc) {
      this.bufferSrc.onended = null;
      try { this.bufferSrc.stop(); } catch { /* already stopped */ }
      this.bufferSrc.disconnect();
      this.bufferSrc = null;
    }
    if (this.demo) { this.demo.stop(); this.demo = null; }
    if (this.micNode) { this.micNode.disconnect(); this.micNode = null; }
    if (this.micStream) {
      for (const tr of this.micStream.getTracks()) tr.stop();
      this.micStream = null;
    }
    this.playing = false;
  }

  async useDemo() {
    await this.ensure();
    this.stopSource();
    this.mode = 'demo';
    this.trackName = 'demo beat · 124 bpm';
    this.monitor.gain.value = 1;
    this.demo = new DemoBeat(this.ctx, this.input);
    this.demo.start();
    this.playing = true;
    this.onChange();
  }

  async useMic() {
    await this.ensure();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.stopSource();
    this.mode = 'mic';
    this.trackName = 'microphone';
    this.monitor.gain.value = 0; // analyzed, never played back (feedback)
    this.micStream = stream;
    this.micNode = this.ctx.createMediaStreamSource(stream);
    this.micNode.connect(this.input);
    this.playing = true;
    this.onChange();
  }

  async loadFile(file) {
    await this.ensure();
    const data = await file.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    this.stopSource();
    this.mode = 'file';
    this.buffer = buffer;
    this.trackName = file.name;
    this.monitor.gain.value = 1;
    this.pausedAt = 0;
    this.startFileAt(0);
    this.onChange();
  }

  startFileAt(offset) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.connect(this.input);
    src.start(0, offset % this.buffer.duration);
    this.bufferSrc = src;
    this.startedAt = this.ctx.currentTime - offset;
    this.playing = true;
  }

  toggle() {
    if (this.mode === 'file' && this.buffer) {
      if (this.playing) {
        this.pausedAt = (this.ctx.currentTime - this.startedAt) % this.buffer.duration;
        this.stopFileOnly();
      } else {
        this.startFileAt(this.pausedAt);
      }
      this.onChange();
    } else if (this.mode === 'demo') {
      if (this.playing) {
        this.demo.stop();
        this.playing = false;
      } else {
        this.demo = new DemoBeat(this.ctx, this.input);
        this.demo.start();
        this.playing = true;
      }
      this.onChange();
    }
  }

  stopFileOnly() {
    if (this.bufferSrc) {
      try { this.bufferSrc.stop(); } catch { /* already stopped */ }
      this.bufferSrc.disconnect();
      this.bufferSrc = null;
    }
    this.playing = false;
  }
}
