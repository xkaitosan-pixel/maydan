import { useEffect } from "react";
import { startMusic, stopMusic, type MusicTrack } from "@/lib/sound";

/**
 * Plays a looping background track while the component is mounted.
 * No-op when background music is disabled in settings (default OFF).
 */
export function useBackgroundMusic(track: MusicTrack = "calm") {
  useEffect(() => {
    startMusic(track);
    return () => stopMusic();
  }, [track]);
}
