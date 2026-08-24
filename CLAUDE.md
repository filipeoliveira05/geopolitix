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

## Testing / verification process

Run this after any feature or bug fix, in order — don't stop at lint/typecheck for UI work,
and don't skip straight to "looks right" without actually loading the page:

1. **Static checks** — fast, catch most regressions:
   ```
   npm run lint
   npx tsc --noEmit
   npm run build
   ```
2. **Load it in a real (headless) browser and look at it.** This repo has no browser tool
   built in and no `chromium-cli` install, so use the `run` skill, which falls back to a
   Playwright driver script. Concretely:
   - Install once per environment if missing: `npx playwright install chromium` (no
     `--with-deps` — this sandbox has no root, and Chromium runs fine without the OS deps).
     `playwright` itself isn't a project dependency; install it in the scratchpad dir
     (`npm init -y && npm install playwright`), not in `package.json`.
   - Start the server in the background and poll the port instead of sleeping:
     `(npm run dev > /tmp/geopolitix-dev.log 2>&1 &)` then
     `timeout 30 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'`.
   - **Before restarting on a port, actually confirm it's free**: `curl` succeeding against
     "READY" can be a *stale* server from a previous run answering, not the one you just
     started — `npm run dev &`'s `$!` is only the npm wrapper, it doesn't forward signals to
     the real `next-server` child, so `kill $!` / a bare port-based `kill` can silently fail
     while a background start keeps failing with `EADDRINUSE` into its own log. Verify with
     `ss -ltnp | grep <port>` (or `lsof -i:<port>`) and kill the actual PID it names before
     trusting a fresh start.
   - Drive it with a small `playwright` script (`chromium.launch({ args: ["--no-sandbox"] })`):
     `page.goto(url, { waitUntil: "load" })` — **not** `"networkidle"`, which hangs
     indefinitely against Next dev's HMR websocket. `waitForSelector` on something
     meaningful, screenshot, and collect `page.on("console")` (filter `type() === "error"`)
     and `page.on("pageerror")`.
   - **Read the screenshot.** A blank/white render with zero console errors is not a pass —
     MapLibre in particular can fail entirely silently (see the worker gotcha below). If
     something should be visible and isn't, check actual pixel data
     (`gl.readPixels` on the canvas) or introspect the library's runtime state before
     concluding "it's just styling."
3. Only report a UI change as verified after step 2 actually shows the right thing on
   screen — build success and no console errors are necessary but not sufficient.

**Known gotcha — MapLibre GL + Next.js/Turbopack renders a blank map with zero errors:**
MapLibre resolves its Web Worker script relative to its own bundled module's
`import.meta.url`, which under Next.js points at an internal chunk with no sibling worker
file. The worker silently fails to load, so the GeoJSON source never finishes processing —
map canvas exists, no console error, nothing ever draws. Fixed via
`scripts/copy-maplibre-worker.mjs` (runs on `postinstall`, copies
`maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs` into `public/`) plus
`setWorkerUrl("/maplibre-gl-worker.mjs")` in `src/components/UsMap.tsx`. If MapLibre ever
renders blank again after a version bump, check this first — the two file names are the ones
to re-verify still exist in `node_modules/maplibre-gl/dist/`.

## Status

Base Next.js + Tailwind + TypeScript scaffold in place (App Router, ESLint). Home page
(`src/app/page.tsx`) renders an interactive MapLibre US-states map
(`src/components/UsMap.tsx`) with click-to-select and a side panel
(`src/components/StatePanel.tsx`) backed by mock political data
(`src/lib/mock-states.ts`, only CA/TX/NY/FL populated) — a stand-in for Supabase until a
project exists (blocked on the user regaining GitHub 2FA access). No Supabase project, no
real data sync, no other pages built yet.
