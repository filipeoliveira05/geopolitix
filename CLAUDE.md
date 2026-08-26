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
- **`governors.mjs` gotchas, both worth knowing before touching it again:**
  - **Normalize party strings.** OpenStates returns `"Democratic"` (and Minnesota's
    `"Democratic-Farmer-Labor"`) — the app's convention (from `congress-legislators`, already
    in `terms.party`) is `"Democrat"`. `normalizeParty()` handles this; without it, every
    Democrat governor silently renders `(?)` in `PartyBadge` (a real bug hit and fixed — check
    this first if a new sync ever shows unexpected `(?)` badges).
  - **The "OpenStates is missing a Governor entry" gap is bigger than the plan's single
    documented case (California)** — 11 states had no `"Governor"` role in live testing
    (verified as real gaps, not a query bug, by checking raw API responses). All 11 have a
    `GOVERNOR_OVERRIDES` entry now; DC is separately excluded (has a Mayor, not a Governor —
    zero executive results from OpenStates, not a gap). Re-check occasionally whether
    OpenStates has filled a gap and drop the override if so.
  - **Rate limiting is stricter/more persistent in practice than the plan's "~10 req/sec"
    suggests** — hit sustained 429s during testing that took several minutes to clear, not
    seconds. The script paces at 1 req/sec with backoff-and-retry on 429; if re-running
    repeatedly in a short session, expect to hit it anyway.
- **`districts` migrated, but geometry lives outside Postgres.** `sync:districts` writes two
  things: lightweight metadata rows (`id` = Census GEOID, `state_id`, `district_number`, no
  geometry) into the `districts` table, and the combined TopoJSON topology (~2.5MB, one blob
  sharing borders between adjacent districts — a 5x reduction from ~13MB as independent
  per-row GeoJSON) to a public Supabase Storage bucket (`district-geometry/topology.json`),
  not a `geojson` column. `terms.district_id`/`races_2026.district_id` can now resolve, though
  nothing populates them yet — House terms still join by the separate `district_number` column
  (`getCurrentRepsByDistrictKey()`). `src/lib/districts-geo.ts` fetches the Storage blob
  directly (public URL, no auth) rather than querying Postgres for it.
- **`races_2026.mjs` gotchas** (Wikipedia infobox parsing, Senate + Governors only, no key):
  - **The plan's assumed template name was wrong — verified live before coding, not guessed.**
    Every race page uses generic `{{Infobox election}}`, not a chamber-specific
    `{{Infobox U.S. Senate election}}`. Candidate field names vary *within* a chamber, not just
    across chambers — some Governors pages use `nominee1`/`nominee2`, others `candidate1`/
    `candidate2` — the parser tries both per index.
  - **Normalize party strings by substring match, not exact string.** Pages use the generic
    `"Democratic Party (United States)"` or a state-affiliate name (`"Republican Party of
    Texas"`, `"Texas Democratic Party"`) — `normalizeParty()` matches on `/democrat/i` /
    `/republican/i`/`/independent/i` rather than exact strings, which would silently miss the
    affiliate-named cases.
  - **A non-empty `after_election` field doesn't mean the race is called** — pages awaiting a
    result sometimes fill it with a literal placeholder (`"TBD"`) rather than leaving it blank.
    Trust it only if it names one of the actual parsed candidates (a real bug hit and fixed:
    Wisconsin's governor race was wrongly marked "called" with a null winner before this
    check). If a new sync ever shows a "called" race with no visible winner, check this first.
  - Wikipedia's rate limit is also stricter in practice than expected — hit sustained 429s
    (same pattern as the governors sync). Runs sequentially (not both chambers concurrently —
    that doubles the effective rate) at 1 req/sec with retry-and-backoff.
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

Base Next.js + Tailwind + TypeScript scaffold in place. Infra checklist (plan §7) mostly done:
GitHub repo pushed and tracked; Supabase project linked via CLI (credentials in gitignored
`.env.local`); schema applied as versioned migrations (`supabase/migrations/`); Vercel project
connected with Vercel Authentication as the deployment gate; Supabase env vars wired to both
Vercel and local `.env.local`. Remaining: geography/sports sync, `/midterms-2026` scoreboard
page, cron automation (all manual `npm run sync:*` today).

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
of scope). No standalone `/midterms-2026` scoreboard page yet (plan §5).

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
