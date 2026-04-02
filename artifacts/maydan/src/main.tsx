import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./lib/theme";
import { initSoundOnFirstGesture } from "./lib/sound";

initTheme();
initSoundOnFirstGesture();
createRoot(document.getElementById("root")!).render(<App />);
