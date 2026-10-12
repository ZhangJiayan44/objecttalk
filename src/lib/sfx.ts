/**
 * Tiny synthesized sound effects (Web Audio). No audio files to ship or load.
 */
let ctx: AudioContext | null = null;
let muted = false;

function audio() {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  pop: () => tone(660, 0, 0.12, 'triangle', 0.1),
  place: () => {
    tone(392, 0, 0.1, 'triangle');
    tone(523, 0.06, 0.12, 'triangle');
  },
  wrong: () => {
    tone(220, 0, 0.18, 'sawtooth', 0.06);
    tone(180, 0.12, 0.22, 'sawtooth', 0.05);
  },
  success: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.22, 'triangle', 0.1)),
  tick: () => tone(880, 0, 0.05, 'square', 0.04),
  setMuted(m: boolean) {
    muted = m;
  },
  get muted() {
    return muted;
  },
};
