---
name: GitHub push path for this repl
description: How to push code changes to GitHub when git credentials are unavailable
---
Remote: `xkaitosan-pixel/maydan`, default branch `main`. There is no `origin` git remote (only a gitsafe backup), and both `gitPush` and sandbox `listConnections('github')` fail/return empty (credentials withheld) even though the GitHub connection is `added`.

**Why:** the git-credential path is blocked in this workspace. The connector proxy allows reads and some small writes, but Cloudflare may selectively reject project file bodies across Git Data, Contents, and GraphQL APIs even after retries.

**How to apply:** try normal git push first, then `@replit/connectors-sdk`. Stage connector writes on a temporary branch and move `main` only after tree verification; if Cloudflare rejects a file across APIs, delete the temporary branch and report the block rather than partially updating `main`.
