---
name: Shared Supabase environment
description: The deliberate current decision to use one Supabase project for Maydan development and production.
---

Maydan intentionally uses the same Supabase project for development and production for now. Do not split the environments or request a second project unless the owner revisits this decision.

**Why:** The project owner prefers the simplicity of one project at the current app size and will consider a separate testing project later.

**How to apply:** Treat migrations and real browser verification as production operations. Keep automated browser tests on placeholders, use non-destructive uniquely identified records when live verification is unavoidable, and avoid broad cleanup.
