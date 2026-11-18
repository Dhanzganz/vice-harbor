// Vice Harbor — WebAudio-synthesized sound only. No audio files: the engine
// hum, sirens, gunshots, crashes and pickups are all oscillators and filtered
// noise, created lazily after the first user gesture (browsers refuse an
// AudioContext before one). Every sfx entry point is a no-op until then.

let ctx = null;
let master = null;
let engineNodes = null;
let sirenNodes = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

function env(gain, t0, peak, dur) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone(freq, dur, type = 'square', peak = 0.5, slideTo = null, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  env(g, t0, peak, dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise(dur, peak = 0.5, freq = 1200, q = 0.8, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t0, peak, dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}

export const sfx = {
  gun() { noise(0.13, 0.9, 900, 0.4); tone(160, 0.1, 'sawtooth', 0.4, 40); },
  punch() { noise(0.07, 0.5, 500, 1); tone(90, 0.08, 'sine', 0.5, 50); },
  crash(big = false) { noise(big ? 0.4 : 0.2, big ? 0.9 : 0.55, 300, 0.5); tone(70, 0.25, 'triangle', 0.4, 30); },
  pickup() { tone(660, 0.09, 'sine', 0.4); tone(990, 0.14, 'sine', 0.4, null, 0.08); },
  cash() { tone(880, 0.08, 'square', 0.25); tone(1174, 0.1, 'square', 0.25, null, 0.07); tone(1568, 0.16, 'square', 0.25, null, 0.14); },
  door() { tone(220, 0.07, 'square', 0.3, 140); noise(0.05, 0.2, 2000, 2, 0.05); },
  alarm() { for (let i = 0; i < 3; i++) tone(1180, 0.11, 'square', 0.3, null, i * 0.16); },
  hurt() { tone(200, 0.15, 'sawtooth', 0.35, 90); },
  mission() { tone(523, 0.12, 'triangle', 0.4); tone(659, 0.12, 'triangle', 0.4, null, 0.11); tone(784, 0.22, 'triangle', 0.45, null, 0.22); },
  fail() { tone(392, 0.16, 'triangle', 0.4); tone(311, 0.16, 'triangle', 0.4, null, 0.15); tone(233, 0.3, 'triangle', 0.4, null, 0.3); },
  click() { tone(1200, 0.04, 'square', 0.18); },
};

// Continuous engine loop while driving; pitch follows speed.
export function setEngine(on, speedRatio = 0) {
  if (!ctx) return;
  if (on && !engineNodes) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    g.gain.value = 0.0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o.start(); o2.start();
    engineNodes = { o, o2, g };
  }
  if (engineNodes) {
    const t = ctx.currentTime;
    engineNodes.o.frequency.setTargetAtTime(52 + speedRatio * 130, t, 0.08);
    engineNodes.o2.frequency.setTargetAtTime(26 + speedRatio * 66, t, 0.08);
    engineNodes.g.gain.setTargetAtTime(on ? 0.24 : 0.0, t, 0.1);
    if (!on) { const n = engineNodes; engineNodes = null; setTimeout(() => { try { n.o.stop(); n.o2.stop(); } catch {} }, 400); }
  }
}

// Two-tone police siren while the player is wanted and police are near.
export function setSiren(on) {
  if (!ctx) return;
  if (on && !sirenNodes) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 880;
    lfo.type = 'square'; lfo.frequency.value = 0.9; lg.gain.value = 190;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.value = 0.055;
    o.connect(g); g.connect(master);
    o.start(); lfo.start();
    sirenNodes = { o, lfo, g };
  }
  if (!on && sirenNodes) {
    const n = sirenNodes; sirenNodes = null;
    try { n.o.stop(); n.lfo.stop(); } catch {}
  }
}
