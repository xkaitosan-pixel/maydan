const INSTALL_GAME_COUNT_KEY = "maydan_pwa_completed_games";

export const PWA_GAME_COMPLETED_EVENT = "maydan:pwa-game-completed";

export function getCompletedGamesForInstall(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(INSTALL_GAME_COUNT_KEY)) || 0);
  } catch {
    return 0;
  }
}

export function recordCompletedGameForInstall(): number {
  const next = getCompletedGamesForInstall() + 1;
  try {
    localStorage.setItem(INSTALL_GAME_COUNT_KEY, String(next));
  } catch {
    // The install prompt is an enhancement; blocked storage must not affect play.
  }
  window.dispatchEvent(new CustomEvent(PWA_GAME_COMPLETED_EVENT, { detail: next }));
  return next;
}

export function isInstalledPwa(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}