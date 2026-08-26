---
name: Sub-path production tests
description: How to test Maydan production builds under a non-root URL prefix.
---

Mount the built output directory beneath the configured base path when testing sub-path deployments; do not rely on Vite preview to emulate that hosting shape.

**Why:** Vite preview serves files from its own root. A build configured for a non-root base requests assets and its service worker beneath that prefix, so preview returns the SPA HTML fallback for those files and creates false failures.

**How to apply:** Ensure the production test host maps the configured URL prefix to the built output before checking base-relative assets, links, redirects, or service-worker behavior.