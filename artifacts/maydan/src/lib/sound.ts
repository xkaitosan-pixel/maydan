// ── AudioContext — created on first user gesture, never on load ───────────────

let _ctx: AudioContext | null = null;
let _initialized = false;

function getCtx(): AudioContext | null {
  if (!_ctx) return null;
  if (_ctx.state === "suspended") {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

function createCtx() {
  if (_ctx) return;
  try {
    _ctx = new AudioContext();
    if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  } catch { /* unsupported */ }
}

/**
 * Call once (e.g. in main.tsx or App.tsx) to wire up the first-gesture
 * listener that unlocks AudioContext for the rest of the session.
 */
export function initSoundOnFirstGesture() {
  if (_initialized) return;
  _initialized = true;
  const unlock = () => {
    createCtx();
    document.removeEventListener("click", unlock, true);
    document.removeEventListener("touchstart", unlock, true);
    document.removeEventListener("keydown", unlock, true);
  };
  document.addEventListener("click", unlock, true);
  document.addEventListener("touchstart", unlock, true);
  document.addEventListener("keydown", unlock, true);
}

// ── Preference helpers ────────────────────────────────────────────────────────

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

// ── Primitive tone builder ────────────────────────────────────────────────────

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.25,
  delayS = 0,
  freqEnd?: number,   // optional frequency ramp end value
) {
  if (!getSoundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  try {
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.connect(gain);
    gain.connect(c.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + delayS);
    if (freqEnd !== undefined) {
      osc.frequency.linearRampToValueAtTime(freqEnd, now + delayS + dur);
    }

    gain.gain.setValueAtTime(0, now + delayS);
    gain.gain.linearRampToValueAtTime(vol, now + delayS + 0.005); // quick attack
    gain.gain.setValueAtTime(vol, now + delayS + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delayS + dur);

    osc.start(now + delayS);
    osc.stop(now + delayS + dur + 0.01);
  } catch { /* ignore */ }
}

// ── Sound effects ─────────────────────────────────────────────────────────────

/** Two quick ascending tones: C5 → E5 */
export function playCorrect() {
  tone(523, 0.15, "sine", 0.3);          // C5
  tone(659, 0.15, "sine", 0.3, 0.18);   // E5
}

/** One low descending tone: E3 → C3 */
export function playWrong() {
  tone(165, 0.3, "sawtooth", 0.25, 0, 131); // E3 ramps to C3
}

/** Very short tick: 800 Hz, 50 ms */
export function playClick() {
  tone(800, 0.05, "sine", 0.15);
}

/** Soft timer warning tick: 600 Hz, 80 ms */
export function playTick() {
  tone(600, 0.08, "sine", 0.1);
}

/** Victory fanfare */
export function playGameOver() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, "sine", 0.28, i * 0.16));
}

/** Match-found chime */
export function playMatchFound() {
  [440, 550, 660].forEach((f, i) => tone(f, 0.2, "sine", 0.28, i * 0.12));
}
