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

// ── Volume preferences ────────────────────────────────────────────────────────
// Stored 0..1. SFX default loud-ish, music subtle. Music is OFF by default.

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function getSfxVolume(): number {
  const v = localStorage.getItem("maydan_sfx_vol");
  return v === null ? 0.8 : clamp01(parseFloat(v));
}

export function setSfxVolume(v: number) {
  localStorage.setItem("maydan_sfx_vol", String(clamp01(v)));
}

export function getMusicVolume(): number {
  const v = localStorage.getItem("maydan_music_vol");
  return v === null ? 0.35 : clamp01(parseFloat(v));
}

export function setMusicVolume(v: number) {
  const c = clamp01(v);
  localStorage.setItem("maydan_music_vol", String(c));
  if (_musicGain && _ctx) {
    _musicGain.gain.setTargetAtTime(c, _ctx.currentTime, 0.1);
  }
}

/** Background music is OFF by default (null → false). */
export function getMusicEnabled(): boolean {
  return localStorage.getItem("maydan_music") === "1";
}

export function setMusicEnabled(v: boolean) {
  localStorage.setItem("maydan_music", v ? "1" : "0");
  if (!v) stopMusic();
}

export function toggleMusic(): boolean {
  const next = !getMusicEnabled();
  setMusicEnabled(next);
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
  const v = vol * getSfxVolume();
  if (v <= 0) return;
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
    gain.gain.linearRampToValueAtTime(v, now + delayS + 0.005);
    gain.gain.setValueAtTime(v, now + delayS + dur * 0.7);
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

/** Triumphant level-up: ascending major chord then sparkle */
export function playLevelUp() {
  [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, "triangle", 0.3, i * 0.09));
}

/** Achievement unlock: bright two-tone bell */
export function playAchievement() {
  tone(880, 0.18, "triangle", 0.3);
  tone(1175, 0.25, "triangle", 0.28, 0.12);
  tone(1568, 0.3, "sine", 0.22, 0.24);
}

/** Coin earned: short metallic ping */
export function playCoin() {
  tone(988, 0.08, "square", 0.18);
  tone(1318, 0.12, "square", 0.16, 0.05);
}

/**
 * Streak/combo earned. Pitch rises with combo tier:
 *  c<3 → noop, 3-5 → C, 6-9 → G, 10+ → C(higher) with extra chime.
 */
export function playComboStreak(combo: number) {
  if (combo < 3) return;
  if (combo >= 10) {
    [784, 988, 1318, 1760].forEach((f, i) => tone(f, 0.12, "triangle", 0.28, i * 0.06));
  } else if (combo >= 6) {
    tone(784, 0.12, "triangle", 0.26);
    tone(988, 0.15, "triangle", 0.26, 0.08);
  } else {
    tone(659, 0.1, "triangle", 0.22);
    tone(784, 0.13, "triangle", 0.22, 0.07);
  }
}

/** Countdown beep for last 3 seconds — slightly higher than the regular tick */
export function playCountdownBeep() {
  tone(900, 0.09, "square", 0.16);
}

/**
 * Unified helper — accepts a wider set of effect names.
 * Also used as a test sound: playSound('click') from the toggle button.
 */
export type SoundType =
  | "correct" | "wrong" | "click" | "tick" | "gameover" | "match"
  | "levelup" | "achievement" | "coin" | "combo" | "countdown";

export function playSound(type: SoundType, extra?: number) {
  switch (type) {
    case "correct":     return playCorrect();
    case "wrong":       return playWrong();
    case "click":       return playClick();
    case "tick":        return playTick();
    case "gameover":    return playGameOver();
    case "match":       return playMatchFound();
    case "levelup":     return playLevelUp();
    case "achievement": return playAchievement();
    case "coin":        return playCoin();
    case "combo":       return playComboStreak(extra ?? 3);
    case "countdown":   return playCountdownBeep();
  }
}

// ── Background music ───────────────────────────────────────────────────────────
// Generative ambient loop built with the Web Audio API (no asset files needed).
// "calm" = slow chord pad for normal play; "party" = energetic arpeggio + bass.
// A dedicated GainNode lets the music volume change live, independent of SFX.

export type MusicTrack = "calm" | "party";

let _musicGain: GainNode | null = null;
let _musicTimer: ReturnType<typeof setInterval> | null = null;
let _musicTrack: MusicTrack | null = null;
let _nextNoteTime = 0;
let _step = 0;

// Step length (seconds) per track.
const STEP_DUR: Record<MusicTrack, number> = { calm: 3.2, party: 0.22 };

// Calm: gentle A-minor pad progression (Am – F – C – G), each a soft triad.
const CALM_CHORDS: number[][] = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [261.63, 329.63, 392.0],
  [196.0, 246.94, 293.66],
];

// Party: C-major pentatonic arpeggio with a bass note on the downbeat.
const PARTY_ARP = [261.63, 329.63, 392.0, 523.25, 659.25, 523.25, 392.0, 329.63];
const PARTY_BASS = [130.81, 174.61, 196.0, 174.61];

function ensureMusicGain(c: AudioContext): GainNode {
  if (!_musicGain) {
    _musicGain = c.createGain();
    _musicGain.gain.value = getMusicVolume();
    _musicGain.connect(c.destination);
  }
  return _musicGain;
}

function musicNote(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  peak: number,
) {
  const g = ensureMusicGain(c);
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(env);
  env.connect(g);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(peak, start + dur * 0.3);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function scheduleMusicStep(c: AudioContext, step: number, at: number) {
  if (_musicTrack === "calm") {
    const chord = CALM_CHORDS[step % CALM_CHORDS.length];
    chord.forEach((f, i) => musicNote(c, f, at + i * 0.04, STEP_DUR.calm + 0.4, "sine", 0.13));
  } else {
    musicNote(c, PARTY_ARP[step % PARTY_ARP.length], at, 0.36, "triangle", 0.12);
    if (step % 4 === 0) {
      musicNote(c, PARTY_BASS[(step / 4) % PARTY_BASS.length], at, 0.55, "sawtooth", 0.1);
    }
  }
}

function tickMusicScheduler() {
  const c = _ctx;
  if (!c || !_musicTrack) return;
  const lookahead = 0.25;
  const stepDur = STEP_DUR[_musicTrack];
  while (_nextNoteTime < c.currentTime + lookahead) {
    scheduleMusicStep(c, _step, _nextNoteTime);
    _nextNoteTime += stepDur;
    _step++;
  }
}

/** Start (or switch to) a looping background track. No-op if music is disabled. */
export function startMusic(track: MusicTrack = "calm") {
  if (!getMusicEnabled()) return;
  const c = getCtx();
  if (!c) return;
  if (_musicTrack === track && _musicTimer) return;
  if (_musicTimer) { clearInterval(_musicTimer); _musicTimer = null; }
  _musicTrack = track;
  _step = 0;
  _nextNoteTime = c.currentTime + 0.1;
  ensureMusicGain(c).gain.setTargetAtTime(getMusicVolume(), c.currentTime, 0.4);
  _musicTimer = setInterval(tickMusicScheduler, 100);
}

/** Stop the background track and fade out the music bus. */
export function stopMusic() {
  if (_musicTimer) { clearInterval(_musicTimer); _musicTimer = null; }
  _musicTrack = null;
  if (_musicGain && _ctx) {
    _musicGain.gain.setTargetAtTime(0.0001, _ctx.currentTime, 0.2);
  }
}
