---
name: Multiplayer browser fixture fidelity
description: Defines the contract fidelity required for Maydan's deterministic dual-session browser tests.
---

Deterministic multiplayer browser fixtures must mirror every server-side invariant that can affect whether two sessions converge: capability tokens, question indexes, phases, authoritative deadlines, score formulas, idempotent settlement, host leases, and room retention.

**Why:** A permissive mock can keep both browsers synchronized while accepting behavior the production RPCs reject, creating false confidence specifically around score and reconnect regressions.

**How to apply:** When an RPC contract or timing rule changes, update both the production implementation and the dual-session fixture, then assert the number and result of writes—not just the final rendered state.