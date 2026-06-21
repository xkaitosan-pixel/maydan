import { useEffect, useState } from "react";
import type { FlashType } from "@/lib/flash";

const COLORS: Record<FlashType, string> = {
  correct: "rgba(34,197,94,0.55)",
  wrong: "rgba(239,68,68,0.55)",
  warn: "rgba(239,68,68,0.45)",
};

/**
 * Mounted once at the app root. Renders a brief screen-edge glow whenever
 * `flashScreen()` is called. Pointer-events none so it never blocks taps.
 */
export default function ScreenFlashHost() {
  const [state, setState] = useState<{ type: FlashType; id: number } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<FlashType>).detail;
      setState({ type: detail, id: Date.now() + Math.random() });
    };
    window.addEventListener("maydan:flash", handler);
    return () => window.removeEventListener("maydan:flash", handler);
  }, []);

  if (!state) return null;

  return (
    <div
      key={state.id}
      className="screen-flash"
      style={{ ["--flash-color" as string]: COLORS[state.type] }}
      onAnimationEnd={() => setState(null)}
    />
  );
}
