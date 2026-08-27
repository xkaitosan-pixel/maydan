---
name: Party timing authority
description: Why Party answer timing and mutations must stay server-timed and capability-bound.
---

Party question starts and answer submissions must use database-clock timestamps, and every mutation available to anonymous Party clients must require an unguessable host or player capability.

**Why:** Guest-provided elapsed time is forgeable, while host realtime/poll observation time penalizes valid answers when delivery is delayed. Public SECURITY DEFINER calls without caller binding also allow room takeover and answering for other players.

**How to apply:** Keep Party scoring based on server-recorded start and answer timestamps. Store only capability hashes, verify the matching capability inside each privileged mutation, and do not restore direct anonymous table writes as a fallback.