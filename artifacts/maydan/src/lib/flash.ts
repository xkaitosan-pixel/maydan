// Lightweight screen-edge flash bus. Any module can trigger a quick coloured
// glow on the screen edges (green = correct, red = wrong) without prop plumbing.
// A single <ScreenFlashHost> mounted at the app root listens and renders it.

export type FlashType = "correct" | "wrong" | "warn";

export function flashScreen(type: FlashType) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FlashType>("maydan:flash", { detail: type }));
}
