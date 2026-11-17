// Vice Harbor — every sound is synthesized with WebAudio; there are no audio files.
// An engine hum that follows the player's speed, a two-tone siren, and one-shot
// blips for gunfire, punches, pickups, crashes and cash. The context only starts
// after the player's first key or click, as browsers require.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFlip = null;
    this.muted = false;
  }

  /** Create the context on the first user gesture; safe to call every frame. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** A short oscillator blip with an exponential decay. */
  blip(freqA, freqB, seconds, type = 'sine', volume = 0.2) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  /** A burst of filtered noise: gunshots, punches and crashes are all this, tuned. */
  noise(seconds, filterFreq, volume = 0.3, type = 'bandpass') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  gunshot() {
    this.noise(0.16, 1800, 0.5);
    this.blip(220, 60, 0.1, 'square', 0.12);
  }

  punch() {
    this.noise(0.08, 300, 0.35, 'lowpass');
  }

  crash(strength = 0.3) {
    this.noise(0.22, 500, Math.min(0.6, strength), 'lowpass');
  }

  pickup() {
    this.blip(880, 1320, 0.12, 'sine', 0.22);
  }

  cashReward() {
    if (!this.ctx || this.muted) return;
    [660, 880, 1100, 1320].forEach((f, i) => {
      setTimeout(() => this.blip(f, f, 0.14, 'triangle', 0.2), i * 70);
    });
  }

  missionFail() {
    this.blip(320, 140, 0.4, 'sawtooth', 0.16);
  }

  /** Start or update the engine hum; speedRatio is 0..1. Call stopEngine on foot. */
  engine(speedRatio, running) {
    if (!this.ctx) return;
    if (!running) {
      this.stopEngine();
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.08);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.05 + speedRatio * 0.05, t, 0.1);
  }

  stopEngine() {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
      } catch { /* already stopped */ }
      this.engineOsc.disconnect();
      this.engineOsc = null;
      this.engineGain = null;
    }
  }

  /** The two-tone siren, on while police are close and the player is wanted. */
  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      let high = false;
      this.sirenFlip = setInterval(() => {
        if (!this.sirenOsc) return;
        high = !high;
        this.sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, this.ctx.currentTime, 0.03);
      }, 380);
      this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : 0.035, this.ctx.currentTime, 0.2);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenFlip);
      try {
        this.sirenOsc.stop();
      } catch { /* already stopped */ }
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }
}
