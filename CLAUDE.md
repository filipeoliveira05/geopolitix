# Geopolitix

US politics & geography learning app. Full project plan (goals, data sources, schema,
sync strategy, page flow, roadmap) lives in **`geopolitix-app-plan.md`** — read it before
doing any non-trivial work here; this file only holds operating conventions and the current
state of the build.

@AGENTS.md

## What this app is

Educational tool for learning the US political system (House, Senate, Governors, Congress
history) and US geography (capitals, cities, sports teams), built on the back of the 2026
midterms. It is explicitly **not** a real-time election results service — see "Non-goals" in
the plan doc.

Build order: **Phase 1 politics → Phase 2 geography → Phase 3 quiz.** Don't jump ahead to
geography/quiz work while Phase 1 is incomplete unless the user asks.

## Tech stack

- Next.js (App Router) + Tailwind CSS
- Supabase (Postgres) — the app **always reads from Supabase**, never calls external
  political/geo APIs directly from the browser
- MapLibre GL JS for the interactive map (not Mapbox — avoids API key/cost dependency)
- TanStack Query for client-side data fetching/caching
- Vercel for deployment (auto-deploy on push), Vercel Cron / Supabase `pg_cron` for sync jobs
- PWA manifest for "Add to Home Screen" (no native app)

## Data conventions

- No hardcoded political/geographic data in the codebase — everything is synced into Supabase
  by scheduled jobs, with a manual refresh path per table (see plan §2, §6).
- Sync frequency is per-table, not blanket — most political/geo facts change rarely; only
  `races_2026` is time-sensitive. Don't add daily cron jobs for static tables (districts,
  sports teams) without a reason.
- Every sync job writes a `sync_logs` row (source, trigger, status, timestamps).
- Schema starting point is in plan §4 (`states`, `legislators`, `terms`, `districts`,
  `governors`, `races_2026`, `cities`, `sports_teams`, `sync_logs`) — treat table/field names
  there as a draft, not gospel; adjust as implementation reveals better shapes, but keep the
  plan doc in sync if the model changes meaningfully.

## Open decisions

See plan §8 (`races_2026` source, auth, MapLibre vs Mapbox, historical depth for Congress).
Flag these to the user when work touches them instead of silently picking an answer.

## Status

Base Next.js + Tailwind + TypeScript scaffold in place (App Router, ESLint). No Supabase
project, no MapLibre integration, no data model or pages built yet.
