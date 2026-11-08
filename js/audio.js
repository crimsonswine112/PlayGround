/**
 * Ash & Oath — tiny procedural audio engine (no audio files).
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ready = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // Shared noise buffer.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Wind bed.
    const wind = ctx.createBufferSource();
    wind.buffer = buf; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 360; wf.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.022;
    lfo.connect(lfoG).connect(wg.gain);
    lfo.start();
    wind.connect(wf).connect(wg).connect(this.master);
    wind.start();

    // Soft dusk drone.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass'; padFilter.frequency.value = 540; padFilter.Q.value = 1.2;
    const padGain = ctx.createGain(); padGain.gain.value = 0.0001;
    padFilter.connect(padGain).connect(this.master);
    padGain.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 6);
    [73.42, 110, 146.83, 220].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 7;
      const g = ctx.createGain(); g.gain.value = i === 3 ? 0.16 : 0.4;
      const trem = ctx.createOscillator(); trem.frequency.value = 0.05 + i * 0.013;
      const tg = ctx.createGain(); tg.gain.value = 0.5;
      trem.connect(tg).connect(g.gain); trem.start();
      o.connect(g).connect(padFilter);
      o.start();
    });

    this.ready = true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.08);
  }

  _tone(freq, dur, type = 'sine', gain = 0.12, slide = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  _noise(dur, freq, gain = 0.12, q = 1, type = 'bandpass', slide = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 1;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0, Math.random() * 1.2); s.stop(t0 + dur + 0.03);
  }

  swing() { this._noise(0.22, 1500, 0.07, 1.4, 'bandpass', 420); }
  hit() { this._tone(140, 0.16, 'square', 0.07, 70); this._noise(0.12, 700, 0.1, 1); }
  hurt() { this._tone(110, 0.28, 'sawtooth', 0.08, 55); this._noise(0.2, 300, 0.08, 0.8, 'lowpass'); }
  spell() {
    this._tone(320, 0.55, 'sine', 0.09, 980);
    this._tone(480, 0.7, 'triangle', 0.04, 1300, 0.03);
    this._noise(0.45, 900, 0.05, 2, 'bandpass', 2400);
  }
  bolt() { this._tone(520, 0.2, 'triangle', 0.045, 260); }
  pickup() {
    [880, 1108, 1318, 1760].forEach((f, i) => this._tone(f, 0.5, 'sine', 0.055, null, i * 0.075));
  }
  ui() { this._tone(660, 0.09, 'triangle', 0.04); }
  roll() { this._noise(0.3, 700, 0.05, 0.7, 'lowpass', 180); }
  death() {
    this._tone(160, 1.6, 'sine', 0.12, 55);
    this._tone(80, 2.0, 'triangle', 0.09, 38);
    this._noise(1.2, 400, 0.05, 0.6, 'lowpass', 80);
  }
  win(kind) {
    const notes = kind === 'kind' ? [392, 523.25, 659.25, 783.99, 1046.5] : [196, 233.08, 311.13, 392, 466.16];
    notes.forEach((f, i) => this._tone(f, 1.8, i > 2 ? 'sine' : 'triangle', 0.055, null, i * 0.16));
  }
  bark() { this._tone(420, 0.1, 'square', 0.03, 300); this._tone(360, 0.12, 'square', 0.025, 240, 0.12); }
}

export const audio = new AudioEngine();
