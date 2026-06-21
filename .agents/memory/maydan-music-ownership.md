---
name: Maydan background music ownership
description: Where background-music playback may be started/stopped in the maydan app, and why Settings must only persist the preference.
---
The generative background-music engine in `artifacts/maydan/src/lib/sound.ts`
runs a global setInterval lookahead scheduler. Playback is **owned exclusively
by the game screens** through the `useBackgroundMusic(track)` hook (start on
mount, stop on unmount): Quiz/Survival/DailyChallenge use "calm";
RankedMode/PartyHost/PartyGuest use "party".

Rule: do NOT call `startMusic()` from non-game pages. The Settings music toggle
must only persist the preference (`toggleMusic()`), which already calls
`stopMusic()` when disabling.

**Why:** Settings has no unmount cleanup; calling startMusic there left the
scheduler running with no owner after navigating away (orphaned interval +
continuous audio). Caught in code review.

**How to apply:** Any new place that wants ambient music should mount the
`useBackgroundMusic` hook on a screen with a real mount/unmount lifecycle, not
call start/stop imperatively from a settings/preference handler.
