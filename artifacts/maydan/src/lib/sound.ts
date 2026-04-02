let _ctx: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    if (!_ctx) _ctx = new AudioContext();
    if (_ctx.state === "suspended") _ctx.resume();
    return _ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.25, delay = 0) {
  const c = ctx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g);
    g.connect(c.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime + delay);
    g.gain.setValueAtTime(vol, c.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
    osc.start(c.currentTime + delay);
    osc.stop(c.currentTime + delay + dur + 0.01);
  } catch { /* ignore */ }
}

export function getSoundEnabled(): boolean {
  const v = localStorage.getItem("maydan_sound");
  return v === null ? true : v === "1";
}

export function isSoundEnabled(): boolean { return getSoundEnabled(); }

export function setSoundEnabled(v: boolean) {
  localStorage.setItem("maydan_sound", v ? "1" : "0");
}

export function toggleSound(): boolean {
  const next = !getSoundEnabled();
  setSoundEnabled(next);
  return next;
}

function guard(): boolean {
  return getSoundEnabled();
}

export function playCorrect() {
  if (!guard()) return;
  tone(523, 0.12, "sine", 0.22);
  tone(659, 0.12, "sine", 0.22, 0.1);
  tone(784, 0.25, "sine", 0.22, 0.2);
}

export function playWrong() {
  if (!guard()) return;
  tone(220, 0.12, "sawtooth", 0.18);
  tone(196, 0.2, "sawtooth", 0.15, 0.1);
}

export function playTick() {
  if (!guard()) return;
  tone(900, 0.04, "square", 0.04);
}

export function playGameOver() {
  if (!guard()) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, "sine", 0.28, i * 0.18));
}

export function playClick() {
  if (!guard()) return;
  tone(700, 0.05, "sine", 0.08);
}

export function playMatchFound() {
  if (!guard()) return;
  [440, 550, 660].forEach((f, i) => tone(f, 0.2, "sine", 0.3, i * 0.12));
}
