# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Artifacts

### `artifacts/maydan` — ميدان تحدي المعرفة (React + Vite web app)

Arabic knowledge challenge game with Supabase backend.

**Features:**
- RTL Arabic layout, dark theme with gold/purple colors
- **15 categories** × **50 questions** = **750 questions** stored in Supabase
- Searchable 2-column category grid; 🔒 premium lock on "تحدي الأساطير"
- 1vs1 challenge via shareable link (`/challenge/:id`)
- 30-second countdown timer per question
- Score tracking and results comparison screen
- WhatsApp share via wa.me link
- Freemium: 5 challenges/day limit for free users (localStorage-based)
- **Game Mode Selector** on home: 4 modes in 2×2 grid (Survival, 1v1, Friends Room, Tournament)
- **Survival Mode** (`/survival`): 3 lives, speed-up timer (30→25→20→15s), rank system
- **Power Cards** during gameplay: 🔄 Skip question, ⏱️ +15 seconds (2/day free)
- **Daily Streak** 🔥: fire counter, milestone popups at 3/7/30 days
- **Statistics Page** (`/stats`): per-category breakdown, progress bars, streak milestones
- **Friends Room** (`/room`): pass-and-play for 2-8 players; room code (ميدان-XXXX); WhatsApp share; turn intros; live mini-leaderboard; final results with medals; winner gets "سيد الميدان 👑"
- **Tournament** (`/tournament`): 2-8 player single-elimination bracket; sequential pass-and-play matches; bracket diagram; champion screen with trophy + WhatsApp share
- **Reward Box**: 24h countdown box on home; animated opening; 4 random reward types (power cards, extra challenges, temp premium, temp legends unlock)
- **Smart Notifications**: in-app dismissable banners — streak danger, reward ready, pending challenge
- **Onboarding** (`/onboarding`): 3-slide animated first-time user flow with orbiting emoji icons; auto-redirected via OnboardingGuard in App.tsx; `markOnboardingComplete()` stored in localStorage
- **Premium** (`/premium`): 19 SAR/month page with 3-day free trial banner, 7-benefit list, comparison vs free tier, trust badges; `activatePremium()` flips `isPremium: true` on UserData; shows Pro badge on Home
- **Leaderboard** (`/leaderboard`): weekly/all-time tabs, category filter scrollable row, gold/silver/bronze medals, my-rank banner, empty state CTA; populated by challenge results, survival games, friends rooms, and tournaments; auto-resets weekly by `getWeekKey()`
- **Viral Share Card** on Results: branded ميدان card with score/pct/rank, "شارك نتيجتك" WhatsApp button + "تحدي صديق" WhatsApp challenge link

**Gamification System (new):**
- **XP & Levels** (7 levels: مبتدئ→بطل الميدان): earned from every game, stored in `users.xp` + `users.level`
- **Coins (قروش)**: earned by winning, displayed in XPBar on Home; spend in Store
- **Achievements (إنجازات)** (`/achievements`): 15 achievements, progress tracking stored in `users.achievements` JSONB `{unlocked, progress, avatar_frame, season_week, power_cards_store}`
- **Weekly Seasons**: seasonal points from ranked matches stored in `users.season_points`; auto-resets weekly and awards coins based on tier (Bronze→Legend)
- **Store (المتجر)** (`/store`): buy avatar frames (gold/fire/royal/legend), titles (فارس شجاع etc.), power cards using coins
- **Home Screen Updates**: XPBar component + season widget + recent achievements preview + links to /achievements and /store

**Key Files:**
- `src/lib/gamification.ts` — XP levels, achievements, store items, season tiers, award/purchase functions
- `src/components/XPBar.tsx` — XP progress bar showing level icon, coin balance, level milestones
- `src/components/AchievementPopup.tsx` — Animated achievement unlock celebration popup
- `src/components/FloatingReward.tsx` — Floating "+XP 🌟 / +coins 🪙" animation after games
- `src/pages/Achievements.tsx` — Achievement list page with progress tracking
- `src/pages/Store.tsx` — Store with frames/titles/power cards tabs
- `src/lib/questions.ts` — 750 Arabic questions (50/category) fetched from Supabase
- `src/lib/storage.ts` — localStorage helpers (user, challenges, streak, power cards, stats, leaderboard, onboarding, premium)
- `src/pages/Home.tsx` — Landing page with mode selector, streak display, leaderboard/premium/stats bottom links
- `src/pages/CreateChallenge.tsx` — Category grid with search
- `src/pages/Quiz.tsx` — Quiz screen with timer + power cards (creator and challenger)
- `src/pages/Results.tsx` — Score display + viral share card (branded card + 2 WhatsApp buttons) + leaderboard recording
- `src/pages/AcceptChallenge.tsx` — Entry for /challenge/:id links
- `src/pages/Survival.tsx` — Survival mode: lives, speed-up timer, game over + rank; records to leaderboard
- `src/pages/Stats.tsx` — Statistics: per-category bars, streak milestones, overview
- `src/pages/Onboarding.tsx` — 3-slide onboarding, orbiting emoji icons, skip/continue flow
- `src/pages/Premium.tsx` — Premium page: price, benefits, free trial, subscribe/cancel
- `src/pages/Leaderboard.tsx` — Weekly/all-time leaderboard with category filter and medals
- `src/components/StreakMilestone.tsx` — Animated milestone popup (3/7/30 days)
- `src/components/RewardBox.tsx` — 24h reward box with countdown + animated opening
- `src/components/NotificationBanner.tsx` — Dismissable in-app notification banners
- `src/pages/FriendsRoom.tsx` — Friends Room: setup → lobby → turn intros → pass-and-play → results
- `src/pages/Tournament.tsx` — Tournament: bracket setup → sequential matches → champion
- `src/App.tsx` — Routing (wouter): /, /onboarding, /create, /quiz, /results, /challenge, /survival, /stats, /room, /tournament, /premium, /leaderboard; OnboardingGuard redirects first-time users

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
