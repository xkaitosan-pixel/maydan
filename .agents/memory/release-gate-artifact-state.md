---
name: Release gate artifact state
description: Invariants for reliable Maydan release checks that build under a test-only base path.
---

Maydan's release gate must leave the deployable output in the real production base-path state. Any browser regression suite that rebuilds into the shared `dist` directory under a synthetic sub-path must be followed by the normal production build.

**Why:** The production-browser suite intentionally compiles for a synthetic sub-path and mutates the same output directory used for publishing. Without a final production rebuild, passing checks can leave incorrect asset, route, OAuth, share, and service-worker URLs ready to deploy.

**How to apply:** Keep the synthetic sub-path test isolated in sequence before the final production build. For service-worker setup, wait on the browser's stable ready/active signal rather than sampling short-lived installing or waiting states, which can transition before assertions observe them.