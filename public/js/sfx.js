// Tiny WebAudio synth so the game has sound without any audio files.

let ctx = null;
let muted = false;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
}

function tone(freq, { at = 0, dur = 0.15, type = 'sine', vol = 0.18, slide = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  join: () => { tone(660, { dur: 0.08, type: 'triangle' }); tone(990, { at: 0.07, dur: 0.12, type: 'triangle' }); },
  tick: () => tone(1200, { dur: 0.04, type: 'square', vol: 0.05 }),
  buzz: () => tone(220, { dur: 0.18, type: 'sawtooth', vol: 0.08, slide: 180 }),
  wrong: () => tone(180, { dur: 0.25, type: 'square', vol: 0.07, slide: -60 }),
  close: () => { tone(520, { dur: 0.1, type: 'triangle' }); tone(500, { at: 0.1, dur: 0.12, type: 'triangle' }); },
  correct: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.18, type: 'triangle', vol: 0.15 })),
  start: () => [392, 523, 659].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.2, type: 'sawtooth', vol: 0.07 })),
  reveal: () => { tone(330, { dur: 0.5, type: 'sine', slide: 330 }); tone(660, { at: 0.15, dur: 0.4, type: 'triangle', vol: 0.1 }); },
  power: () => { tone(900, { dur: 0.25, type: 'sawtooth', vol: 0.07, slide: -700 }); tone(140, { at: 0.08, dur: 0.3, type: 'square', vol: 0.06 }); },
  orb: () => [880, 1175, 1568].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.12, type: 'sine', vol: 0.12 })),
  fanfare: () => [523, 523, 523, 698, 880, 784, 1047].forEach((f, i) =>
    tone(f, { at: [0, 0.12, 0.24, 0.4, 0.6, 0.8, 0.95][i], dur: i === 6 ? 0.6 : 0.16, type: 'triangle', vol: 0.15 })),
};
