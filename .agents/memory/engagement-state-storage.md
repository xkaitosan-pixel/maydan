---
name: Maydan engagement state storage
description: Where per-user engagement state lives and the read/write asymmetry trap
---

# Maydan engagement state storage

Per-user engagement state (daily missions, weekly challenge, reward boxes, category
levels, login streak) lives **nested** at `users.achievements.engagement` (JSONB),
not at the top level of `achievements`. Logged-in users only — guests have no DB row.

**The trap:** `normalizeEngagement(raw)` expects the engagement object itself. Writes
nest it correctly (`writeUser` stores `{ ...achievements, engagement }`), but a read
must extract the nested key first. Passing the whole `achievements` blob to
`normalizeEngagement` silently returns defaults (no matching keys), so state never
persists and claim-once guards (e.g. daily login reward) become re-claimable.

**Rule:** always read engagement via `engagementFrom(rawAchievements)` in
`src/lib/engagement.ts` (it does `normalizeEngagement(parseAchievementsData(raw).engagement)`).
Never call `normalizeEngagement` directly on a `users.achievements` value.

**Why:** the write path nests but the read path is easy to get wrong; the bug is
silent (no error, just zeroed state + reward farming).

**Also:** any award write must preserve the `engagement` passthrough key in
`parseAchievementsData`/`AchievementsData` or the next write wipes engagement state.
Game-end tracking calls `recordEngagementGame` after award logic in Survival, Results,
RankedMode, DailyChallenge — pass true correct-answer **count**, not weighted score
(RankedMode/Daily score are points, so keep a separate correct counter).
