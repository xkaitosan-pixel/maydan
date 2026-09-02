---
name: Shared Supabase environment
description: The operational constraint that Maydan development and production currently share one Supabase database.
---

Maydan development and production currently use the same Supabase database. Treat development database migrations and real-data verification as production operations.

**Why:** The project owner confirmed the environment is shared while completing the Ranked and Daily database restoration. Assuming isolation would risk changing live data during future testing.

**How to apply:** Use non-destructive, uniquely identified test records; avoid cleanup that could touch unrelated rows; and obtain explicit confirmation before broad schema or data changes.