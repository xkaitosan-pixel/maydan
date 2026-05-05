/**
 * Lightweight haptic feedback wrapper around `navigator.vibrate`.
 *
 * - Silently no-ops when the API is unavailable (iOS Safari, desktop browsers
 *   without vibration support, or when the device is muted/policy-blocked).
 * - Respects a single localStorage flag (`maydan_haptics`) so users can opt out.
 * - Never throws.
 */

const HAPTICS_KEY = "maydan_haptics";

export function isHapticsEnabled(): boolean {
  try {
    const v = localStorage.getItem(HAPTICS_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(v: boolean): void {
  try { localStorage.setItem(HAPTICS_KEY, v ? "1" : "0"); } catch { /* ignore */ }
}

function vibrate(pattern: number | number[]): void {
  if (!isHapticsEnabled()) return;
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try { nav.vibrate(pattern); } catch { /* ignore */ }
}

/** Short tap — used for correct answer / minor positive feedback. */
export function hapticCorrect(): void { vibrate(50); }

/** Double tap — used for wrong answer / negative feedback. */
export function hapticWrong(): void { vibrate([100, 100, 100]); }

/** Triple tap — used for achievement unlocks / level-up. */
export function hapticAchievement(): void { vibrate([60, 80, 60, 80, 120]); }

/** Tiny tap — used for button taps where we want a subtle touch response. */
export function hapticTap(): void { vibrate(10); }
