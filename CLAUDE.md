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
- **Sync script pattern, established and in use:** `scripts/sync/*.mjs` — each pulls from one
  public source (no API key/account) and writes a committed JSON file into `src/data/`. These
  are dev-time stand-ins for the real Supabase tables + sync jobs, not the real thing; commit
  the output like any other source-controlled file. So far: `npm run sync:legislators`
  (Congress members/terms, `src/data/legislators.json`) and `npm run sync:districts` (House
  boundaries, `src/data/districts.json`). Follow this same shape for governors/geography/sports
  sync scripts later.
- **The plan's districts source is stale — don't use it without re-checking.** Plan §3 points
  at `unitedstates/districts` (GitHub) for congressional district boundaries; its last *full
  nationwide* set is from 2016, pre-2020-census redistricting (later folders are single-state
  off-cycle updates only — PA/NC/NJ). Using it would draw wrong shapes/district counts against
  current legislator data. `scripts/sync/districts.mjs` uses the Census Bureau's cartographic
  boundary file for the 119th Congress instead — current, official, still no key needed. If
  `unitedstates/districts` ever gets a real update, it's fine to reconsider, but verify the
  "full nationwide set" year first, the same way this was caught.
- **Derived/joined geometry lives in `src/lib/*-geo.ts`, not in a sync script.** Anything that
  combines two already-synced datasets — `districts-geo.ts` joining district shapes to current
  reps' party, `senate-split-geo.ts` splitting a state's real geometry (via `@turf/intersect`,
  not just its bounding box) into per-senator halves — is computed client-side at read time and
  memoized (module-level cache), not precomputed by a sync script. It recomputes automatically
  whenever the underlying synced JSON changes; no separate regeneration step.

## UI conventions

- **Party colors, fixed across the app:** Democrat blue (`#2563eb` / Tailwind `blue-600`),
  Republican red (`#dc2626` / `red-600`), Independent/other grey (`#71717a` / `zinc-500`).
  Single source of truth: `src/lib/party-colors.ts` (`PARTY_COLORS`, `partyStyle()`). Consumed
  by `src/components/PartyBadge.tsx` (text UI, renders `(D)`/`(R)`/`(I)`/`(?)`) and by
  `partyFillColor()` in `src/components/UsMap.tsx` (built from the same table into a MapLibre
  `match` expression for the map's fill layers). Change the palette in `party-colors.ts` only —
  don't hardcode a party hex/class anywhere else.
- **Map has two modes, not three:** "States" (Senate delegation — the state-level chamber) and
  "Districts" (House delegation — the district-level chamber). Senate was briefly its own
  third mode; folded into "States" since a state IS its Senate delegation, the same way a
  district IS its one House member. Don't re-split these without being asked.
- A state's two senators can't both get a flat `fill-color` (a district has one occupant, a
  state has two) — `senate-split-geo.ts` clips the state's real polygon into two halves along a
  diagonal (senior senator top-left, junior bottom-right) only when the senators differ in
  party; same-party states render as one solid color, since a split would just be two
  triangles of the same color. This was a deliberate, explicit call from the user — don't
  revert to always-split without asking.

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
   - **Port 3000 is the user's — they keep `npm run dev` running themselves so they can watch
     it live.** Never start, restart, or kill anything on 3000. Check first
     (`ss -ltnp | grep 3000` or `curl -sf http://localhost:3000`); if something's answering,
     point the browser script straight at `http://localhost:3000` and go. If nothing's
     answering, ask the user to start `npm run dev` rather than starting it yourself.
   - For a one-off **production build** check (rare — most verification is against their dev
     server), use a different port so you never collide with 3000, e.g.
     `(PORT=3001 npm run start > /tmp/geopolitix-start.log 2>&1 &)` then poll it. Same
     stale-server caution applies there: `curl` succeeding can be a stale server answering,
     not the one you just started — `npm run start &`'s `$!` is only the npm wrapper, it
     doesn't forward signals to the real `next-server` child, so a bare port-based `kill` can
     silently fail while a background start keeps failing with `EADDRINUSE` into its own log.
     Verify with `ss -ltnp | grep <port>` and kill the actual PID it names before trusting a
     fresh start — but only ever on the port you're using for this (3001 or similar), never
     3000.
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

Base Next.js + Tailwind + TypeScript scaffold in place (App Router, ESLint). No Supabase
project yet (blocked on the user regaining GitHub 2FA access) — everything below reads from
committed JSON in `src/data/`, produced by the `scripts/sync/*.mjs` scripts, as a stand-in.

**Home page** (`src/app/page.tsx` + `src/components/UsMap.tsx`): interactive MapLibre map,
two modes (see UI conventions above) —
- **States** (default): current Senate delegation per state, split by party where the two
  senators differ.
- **Districts**: current House delegation, one color per district.

Clicking either mode selects a state (districts additionally track which district, outlined
on the map and highlighted in the side panel's rep list). The side panel
(`src/components/StatePanel.tsx`) shows current governor/capital/population (mock,
`src/lib/mock-states.ts`, only CA/TX/NY/FL populated — real governors need an OpenStates sync,
plan §3, not done) and current senators/House reps (real), plus a link to:

**`/state/[abbr]` page** (`src/app/state/[abbr]/page.tsx` + `src/components/StateTabs.tsx`):
four tabs per plan §5 — current representation (real); history (real Senate term history back
to statehood, via `getSenateHistory()`; governors history not synced, noted as such); geography
(mock capital/population; cities/sports flagged "Phase 2, not built"); 2026 midterms
(placeholder — no race data source implemented, plan's open decision §8).

**Synced data**, all via `npm run sync:<name>`, all public sources, no API keys/accounts:
- `legislators.json` (`sync:legislators`) — current + historical Senate terms from
  `unitedstates/congress-legislators`, read through `src/lib/legislators-data.ts`.
- `districts.json` (`sync:districts`) — current (119th Congress) House district boundaries
  from the Census Bureau (not `unitedstates/districts` — see Data conventions above for why),
  read through `src/lib/districts-geo.ts`.
- `fips-to-abbr.json` — static FIPS↔state-abbreviation reference table, shared by both scripts
  and `src/lib/state-fips.ts`.

Not started: Supabase project/schema, governors sync (OpenStates), geography/sports sync,
`races_2026` data, quiz (Phase 3).
