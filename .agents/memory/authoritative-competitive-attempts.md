---
name: Authoritative competitive attempts
description: Security and consistency rules for server-owned Ranked and Daily game state.
---

Persist the immutable question ID sequence when a competitive match or daily attempt is created, then validate every submitted question index and ID against that sequence. Bind unauthenticated guest writes to a high-entropy capability whose hash is stored server-side; a visible guest ID is never sufficient authorization. Allow either participant to request idempotent deadline transitions so one disconnected player cannot stall settlement.

**Why:** Client-selected questions, public guest IDs, and single-client transition ownership each leave a different path to forged scoring, impersonation, or permanently stalled games even when the final database update is transactional.

**How to apply:** Any future competitive or rewarded mode should create its attempt, immutable content assignment, answer ledger, and reward event on the server. Use database time, row locks, unique event keys, null-safe validation, and capability-bound guest RPCs.