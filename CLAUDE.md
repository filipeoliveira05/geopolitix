# Geopolitix

US politics & geography learning app. Full project plan (goals, data sources, schema, sync
strategy, page flow, roadmap) lives in **`geopolitix-app-plan.md`** — read it before doing any
non-trivial work here; this file holds operating conventions and current build state.

@AGENTS.md

## What this app is

Educational tool for the US political system (House, Senate, Governors, Congress history) and
US geography (capitals, cities, sports teams), built on the back of the 2026 midterms — **not**
a real-time results service (see plan's Non-goals).

Build order: **Phase 1 politics → Phase 2 geography → Phase 3 quiz.** Don't jump ahead unless asked.

## Tech stack

- Next.js (App Router) + Tailwind CSS
- Supabase (Postgres) — app always reads from Supabase, never calls external APIs from the browser
- MapLibre GL JS (not Mapbox — no API key/cost)
- TanStack Query for client-side fetching/caching
- Vercel (auto-deploy on push)
- PWA manifest ("Add to Home Screen")

## Data conventions

- No hardcoded political/geographic data — everything lives in Supabase, populated by
  `scripts/sync/*.mjs` (one script per source, run manually via `npm run sync:<name>`; most
  need no API key, `governors` is the exception — see below). Schema draft is plan §4 — adjust
  as implementation reveals better shapes, keep the plan doc in sync if the model changes
  meaningfully.
- **Migrated to Supabase:** `states` (`sync:states` — minimal id/name seed only;
  population/capital/region are Phase 2), `legislators`/`terms` (`sync:legislators`, run
  `sync:states` first — FK dependency), and `governors` (`sync:governors`, needs
  `OPENSTATES_API_KEY` in `.env.local`). App reads through `src/lib/supabase.ts`, a
  `@supabase/postgrest-js` `PostgrestClient` — not the full `@supabase/supabase-js`, whose
  `RealtimeClient` needs a WebSocket constructor Node < 22 lacks natively, and this app has no
  realtime/auth needs. Sync scripts (Node-only, write access) use `@supabase/supabase-js` + the
  `ws` package via `scripts/sync/_supabase-admin.mjs`.
- **`governors.mjs` — full source research/gotchas are in plan §3, don't re-derive them.** The
  two that bite hardest if forgotten: party strings need `normalizeParty()` (OpenStates'
  `"Democratic"` → our `"Democrat"`) or Democrat governors silently render `(?)` badges; and
  OpenStates' rate limit is much stricter in practice than its docs suggest (sustained 429s
  taking minutes to clear, not seconds — expect this if re-running repeatedly in one session).
- **`districts` migrated, but geometry lives outside Postgres.** `sync:districts` writes two
  things: lightweight metadata rows (`id` = Census GEOID, `state_id`, `district_number`, no
  geometry) into the `districts` table, and the combined TopoJSON topology (~2.5MB, one blob
  sharing borders between adjacent districts — a 5x reduction from ~13MB as independent
  per-row GeoJSON) to a public Supabase Storage bucket (`district-geometry/topology.json`),
  not a `geojson` column. `terms.district_id`/`races_2026.district_id` can now resolve, though
  nothing populates them yet — House terms still join by the separate `district_number` column
  (`getCurrentRepsByDistrictKey()`). `src/lib/districts-geo.ts` fetches the Storage blob
  directly (public URL, no auth) rather than querying Postgres for it.
- **`races_2026.mjs` — full source research/gotchas are in plan §3, don't re-derive them.** The
  ones that bite hardest: a "called" race needs `after_election` to actually *name a parsed
  candidate*, not just be non-empty (some pages use a `"TBD"` placeholder pre-results); and
  `cleanWikiText()` strips wiki markup but not raw HTML (`<br />` has leaked into candidate
  names before) — if a candidate name ever looks malformed, check for un-stripped HTML first.
- **Not built yet:** geography/sports sync (Phase 2). Source research is in plan §3.
- **House terms carry `district_number` (plain int) separately from `district_id`** (FK into
  `districts`, populated but currently unused by any other table). `getCurrentRepsByDistrictKey()`
  and `UsMap.tsx` join on `district_number`, not `district_id` — nothing has been changed to
  populate/use the FK yet even though it can now resolve.
- **New Supabase tables need an explicit `GRANT`, not just an RLS policy** — Supabase's cloud
  default gives a fresh table no Data API access at all. Add the `anon` `SELECT` grant when a
  table's read path is actually built (not speculatively); `service_role` already has a
  blanket grant across all tables for sync scripts.
- Derived/joined geometry (`src/lib/*-geo.ts` — e.g. `senate-split-geo.ts` splitting a state
  into per-senator halves via `@turf/intersect`) is computed at read time and memoized, not
  precomputed by a sync script.

## UI conventions

- **Party colors, fixed across the app:** Democrat blue (`#2563eb`), Republican red
  (`#dc2626`), Independent/other grey (`#71717a`). Single source of truth:
  `src/lib/party-colors.ts` (`PARTY_COLORS`, `partyStyle()`), consumed by `PartyBadge.tsx` and
  `UsMap.tsx`'s `partyFillColor()`. Don't hardcode a party hex/class anywhere else.
- **Map has two modes, not three:** "States" (Senate) and "Districts" (House) — Senate was
  briefly its own third mode, folded into "States" since a state IS its Senate delegation.
  Don't re-split without being asked.
- A state's two senators can't share one flat `fill-color` — `senate-split-geo.ts` clips the
  state's real polygon into two halves (senior top-left, junior bottom-right) only when the
  senators differ in party. Deliberate, explicit user call — don't revert without asking.

## Open decisions

- **Auth: none.** Personal-use app — the *deployment* is gated by free Vercel Authentication
  instead (not Password Protection, which needs Vercel Pro/$150mo). Revisit real app-level
  auth only if something worth saving per-user (quiz progress) gets built.
- **Congress history: full depth everywhere**, matching Senate's `getSenateHistory()`. Capping
  is a UI task (collapse/paginate once House/Governors history exists), not a data-scope one.
- **Geography sync (Phase 2):** Claude Code picks the Census/Wikidata/GeoNames combination at
  Phase 2 start — not locked in now.
- **Still open:** MapLibre vs. Mapbox (recommendation: MapLibre, already in use, no reason to
  revisit — flag if work ever depends on switching).

## Testing / verification process

Run this after any feature or bug fix, in order — don't stop at lint/typecheck for UI work,
and don't skip straight to "looks right" without actually loading the page:

1. **Static checks:**
   ```
   npm run lint
   npx tsc --noEmit
   npm run build
   ```
2. **Load it in a real (headless) browser and look at it.** No browser tool or `chromium-cli`
   here, so use the `run` skill, which falls back to a Playwright driver script:
   - Install once per environment if missing: `npx playwright install chromium` (no
     `--with-deps` — sandbox has no root, Chromium runs fine without OS deps). `playwright`
     isn't a project dependency — install it in the scratchpad dir
     (`npm init -y && npm install playwright`).
   - **Port 3000 is the user's** — they keep `npm run dev` running so they can watch it live.
     Never start/restart/kill anything on 3000. Check first (`curl -sf http://localhost:3000`);
     if it's up, point the browser script at it. If not, ask the user to start it.
   - For a rare one-off production-build check, use a different port (e.g. 3001) so you never
     collide with 3000 — `npm run start &`'s `$!` is only the npm wrapper and won't forward
     signals to the real `next-server` child, so verify with `ss -ltnp | grep <port>` and kill
     the actual PID before trusting a fresh start.
   - Drive it with `playwright` (`chromium.launch({ args: ["--no-sandbox"] })`):
     `page.goto(url, { waitUntil: "load" })` — **not** `"networkidle"`, which hangs against Next
     dev's HMR websocket. `waitForSelector` on something meaningful, screenshot, collect
     `page.on("console")` (`type() === "error"`) and `page.on("pageerror")`.
   - **Read the screenshot.** A blank render with zero console errors is not a pass — MapLibre
     can fail silently (see the worker gotcha below). Check actual pixel data or library
     runtime state before concluding "it's just styling."
3. Only report a UI change as verified after step 2 actually shows the right thing on screen —
   build success and no console errors are necessary but not sufficient.

**Known gotcha — MapLibre GL + Next.js/Turbopack renders a blank map with zero errors:**
MapLibre resolves its Web Worker relative to its own bundled module's `import.meta.url`, which
under Next.js points at an internal chunk with no sibling worker file — the worker fails
silently, no GeoJSON source ever finishes processing. Fixed via
`scripts/copy-maplibre-worker.mjs` (`postinstall`, copies the worker files into `public/`) plus
`setWorkerUrl("/maplibre-gl-worker.mjs")` in `UsMap.tsx`. If MapLibre ever renders blank after a
version bump, check this first — verify those two files still exist in
`node_modules/maplibre-gl/dist/`.

## Status

**Phase 1 (politics) is complete** — every page/table in the original Phase 1 scope is built
and reading live from Supabase; infra (below) is fully automated too. Next up per the build
order is Phase 2 (geography/sports sync), unless told otherwise.

Base Next.js + Tailwind + TypeScript scaffold in place. Infra checklist (plan §7) mostly done:
GitHub repo pushed and tracked; Supabase project linked via CLI (credentials in gitignored
`.env.local`); schema applied as versioned migrations (`supabase/migrations/`); Vercel project
connected with Vercel Authentication as the deployment gate; Supabase env vars wired to both
Vercel and local `.env.local`. `states`/`legislators`/`governors`/`races_2026` sync weekly via
GitHub Actions (`.github/workflows/sync.yml`, Monday 06:00 UTC + manual `workflow_dispatch`) —
not Vercel Cron as the plan originally sketched; `governors.mjs`/`races-2026.mjs` deliberately
rate-limit themselves to ~70-100+s each, tight against Vercel's 300s function timeout and
requiring restructuring into HTTP handlers, so a plain scheduled workflow running the existing
`npm run sync:*` scripts unchanged was the lower-risk choice. Needs three repo secrets set
(Settings → Secrets and variables → Actions): `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `OPENSTATES_API_KEY`. Each sync step runs independently
(`continue-on-error` per step, so one external API having a bad day doesn't skip the others —
OpenStates rate limits have been hit repeatedly, including once in the real cron run itself),
but a final step re-checks each step's outcome and fails the overall run if any of them
genuinely errored — **`continue-on-error` alone silently reports the whole job as
"success" even when a step fails; caught from a real run** (governors.mjs hit OpenStates'
rate limit and errored, workflow still showed green) and fixed with that explicit check,
so the job status is trustworthy without needing to cross-check `sync_logs` for a real
failure. `districts` stays manual-only (redistricting is ~once/decade, per plan §6).
Remaining: geography/sports sync (Phase 2).

**Home page** (`src/app/page.tsx` + `UsMap.tsx`): interactive MapLibre map, two modes (see UI
conventions) — States (default, current Senate delegation) and Districts (current House
delegation). Clicking either selects a state (Districts additionally tracks which district).
The side panel (`StatePanel.tsx`) shows real governor/senators/House reps (Supabase, via
TanStack Query) and mock capital/population (`src/lib/mock-states.ts`, only CA/TX/NY/FL
populated), plus a link to:

**`/state/[abbr]` page** (`src/app/state/[abbr]/page.tsx` + `StateTabs.tsx`): four tabs per
plan §5 — current representation (real, including governor); history (real Senate history back
to statehood, governor history not synced — no history modeled for `governors`, current
officeholder only); geography (mock, cities/sports flagged "Phase 2, not built"); 2026 midterms
(real — Senate/Governor races for this state, per-candidate party + incumbent flag; House out
of scope).

**`/midterms-2026`** (plan §5): scoreboard (called vs. total, per office) + full Senate/Governor
race lists nationwide, linked from the map's top-right corner. `force-dynamic` — no dynamic
route params here to make Next treat it as needing per-request data automatically, so without
this it would prerender once at build time and serve stale race data forever (caught before
shipping, not after).

**`/legislator/[id]`** and **`/governor/[id]`** (plan §5): photo, party, term history (legislator
only — governors have no history modeled) for one person. `id` is `legislators.id`
(`bioguide_id`) / `governors.id` (OpenStates person id with its `"ocd-person/"` prefix stripped
at sync time — the raw id contains a `/`, which broke the route; caught via a real 404 in
browser verification, not assumed). Linked from senator/rep/governor names across
`StatePanel.tsx`/`StateTabs.tsx`/`RepresentativesList.tsx`.

**Synced data**, via `npm run sync:<name>`:
- `states` — minimal id/name seed (`us-atlas` + `fips-to-abbr.json`), 50 states + DC.
- `legislators`/`terms` — current + historical Senate terms (House current-only), from
  `unitedstates/congress-legislators`.
- `governors` — current governor per state, from OpenStates v3 (`OPENSTATES_API_KEY` required).
  See the Data conventions gotchas above before re-running or modifying this one.
- `races_2026`/`race_candidates` — Senate + Governor races, from Wikipedia (71 races, no key).
  See the Data conventions gotchas above before re-running or modifying this one.
- `districts` (metadata table) + `district-geometry/topology.json` (Storage blob) — current
  (119th Congress) House boundaries from the Census Bureau, 436 districts. See the Data
  conventions note above on why geometry isn't a table column.
- `fips-to-abbr.json` — static FIPS↔abbreviation table, shared by multiple scripts and
  `src/lib/state-fips.ts`.

Not started: geography/sports sync, quiz (Phase 3).
