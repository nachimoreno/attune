// Scope: log-frequency spectrum tinted by band (amber lows / rose mids /
// cyan highs), a centroid marker, and below it the kick detector trace —
// flux ratio against its threshold line, with fired onsets marked.
// This is where you *see* whether the engine hears what you hear.

const COL_LOW = '255, 180, 84';
const COL_MID = '255, 92, 138';
const COL_HIGH = '110, 231, 255';

const N_COLS = 72;
const F_LO = 32;
const F_HI = 16000;

export class Scope {
  constructor(canvas, sampleRate, fftSize) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d');
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    // precompute bin range + color per column (log-spaced)
    this.cols = [];
    const hz = sampleRate / fftSize;
    for (let c = 0; c < N_COLS; c++) {
      const f0 = F_LO * Math.pow(F_HI / F_LO, c / N_COLS);
      const f1 = F_LO * Math.pow(F_HI / F_LO, (c + 1) / N_COLS);
      const a = Math.max(1, Math.floor(f0 / hz));
      const b = Math.max(a + 1, Math.ceil(f1 / hz));
      const color = f0 < 250 ? COL_LOW : f0 < 2000 ? COL_MID : COL_HIGH;
      this.cols.push({ a, b, color });
    }
  }

  freqToX(f, w) {
    return (Math.log(f / F_LO) / Math.log(F_HI / F_LO)) * w;
  }

  draw(extractor, signals) {
    const cv = this.canvas, g = this.ctx2d;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cv.clientWidth * dpr);
    const h = Math.round(cv.clientHeight * dpr);
    if (!w || !h) return;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }

    g.clearRect(0, 0, w, h);
    const specH = h * 0.62;
    const fluxTop = specH + 4 * dpr;
    const fluxH = h - fluxTop;

    // --- spectrum ---
    const db = extractor.freqDb;
    const colW = w / N_COLS;
    for (let c = 0; c < N_COLS; c++) {
      const { a, b, color } = this.cols[c];
      let peak = -160;
      for (let i = a; i < b && i < db.length; i++) {
        if (db[i] > peak) peak = db[i];
      }
      let v = (peak + 92) / 66; // -92..-26 dB → 0..1
      v = Math.min(Math.max(v, 0), 1);
      if (v <= 0.005) continue;
      g.fillStyle = `rgba(${color}, ${0.25 + v * 0.6})`;
      const bh = v * (specH - 2);
      g.fillRect(c * colW + 0.5, specH - bh, colW - 1, bh);
    }

    // centroid marker
    if (signals.bright > 0.01) {
      const cf = 200 * Math.pow(8000 / 200, signals.bright);
      const x = this.freqToX(cf, w);
      g.strokeStyle = 'rgba(242, 239, 233, 0.55)';
      g.lineWidth = dpr;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, specH);
      g.stroke();
    }

    // --- kick detector trace ---
    // y maps ratio 0..3 into the strip; the threshold (ratio = 1) is a line
    const yOf = r => fluxTop + fluxH - Math.min(r / 3, 1) * fluxH;
    g.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    g.setLineDash([3 * dpr, 3 * dpr]);
    g.beginPath();
    g.moveTo(0, yOf(1));
    g.lineTo(w, yOf(1));
    g.stroke();
    g.setLineDash([]);

    const hist = extractor.fluxHist, fires = extractor.fireHist;
    const len = extractor.histLen, head = extractor.histHead;
    g.strokeStyle = `rgba(${COL_LOW}, 0.85)`;
    g.lineWidth = dpr;
    g.beginPath();
    for (let i = 0; i < len; i++) {
      const v = hist[(head + i) % len];
      const x = (i / (len - 1)) * w;
      const y = yOf(v);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();

    g.fillStyle = `rgba(${COL_LOW}, 0.9)`;
    for (let i = 0; i < len; i++) {
      if (!fires[(head + i) % len]) continue;
      const x = (i / (len - 1)) * w;
      g.fillRect(x - dpr, fluxTop, dpr * 2, 3 * dpr);
    }
  }
}

export const SIGNAL_COLORS = {
  kick: COL_LOW, bass: COL_LOW,
  snare: COL_MID, mid: COL_MID,
  hihat: COL_HIGH, treble: COL_HIGH,
};
