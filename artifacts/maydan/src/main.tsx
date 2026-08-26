import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./lib/theme";
import { initSoundOnFirstGesture } from "./lib/sound";

initTheme();
initSoundOnFirstGesture();
createRoot(document.getElementById("root")!).render(<App />);

// Keep registration dependency-free and out of development, where a stale
// worker can otherwise mask source changes. BASE_URL supports sub-path deploys.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const baseUrl = import.meta.env.BASE_URL.endsWith("/")
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`;
    navigator.serviceWorker
      .register(`${baseUrl}service-worker.js`, { scope: baseUrl })
      .catch((error: unknown) => {
        console.warn("Service worker registration failed:", error);
      });
  });
}
