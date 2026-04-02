// ── AudioContext ─────────────────────────────────────────────────────────────
// Created lazily on ANY user gesture — never at module load.
// getCtx() is safe to call from within event handlers: it auto-creates if needed.

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!_ctx) {
    try {
      _ctx = new AudioContext();
    } catch { return null; }
  }
  if (_ctx.state === "suspended") {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

/**
 * Optionally call once at startup to pre-register a capture listener that
 * creates the AudioContext on the very first gesture — ensures it is ready
 * even before the first playSound call.
 */
export function initSoundOnFirstGesture() {
  const unlock = () => {
    getCtx(); // warm up context
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

// ── Core tone builder ─────────────────────────────────────────────────────────

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.25,
  delayS = 0,
  freqEnd?: number,
) {
  if (!getSoundEnabled()) return;
  const c = getCtx();          // auto-creates context inside any gesture
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
    gain.gain.linearRampToValueAtTime(vol, now + delayS + 0.005);
    gain.gain.setValueAtTime(vol, now + delayS + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delayS + dur);

    osc.start(now + delayS);
    osc.stop(now + delayS + dur + 0.01);
  } catch { /* ignore */ }
}

// ── Named effects ─────────────────────────────────────────────────────────────

/** Two ascending tones: C5 → E5 */
export function playCorrect() {
  tone(523, 0.15, "sine", 0.3);
  tone(659, 0.15, "sine", 0.3, 0.18);
}

/** Descending sawtooth: E3 → C3 */
export function playWrong() {
  tone(165, 0.3, "sawtooth", 0.25, 0, 131);
}

/** Short tick: 800 Hz, 50 ms */
export function playClick() {
  tone(800, 0.05, "sine", 0.15);
}

/** Soft timer warning: 600 Hz, 80 ms */
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

/**
 * Unified helper — accepts 'correct' | 'wrong' | 'click' | 'tick' | 'gameover'.
 * Also used as a test sound: playSound('click') from the toggle button.
 */
export function playSound(type: "correct" | "wrong" | "click" | "tick" | "gameover" | "match") {
  switch (type) {
    case "correct":  return playCorrect();
    case "wrong":    return playWrong();
    case "click":    return playClick();
    case "tick":     return playTick();
    case "gameover": return playGameOver();
    case "match":    return playMatchFound();
  }
}
