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
- **Sync script pattern:** `scripts/sync/*.mjs`, each pulling from one public source (no API
  key/account). Two write straight to Supabase now (the real thing, not a stand-in):
  `npm run sync:states` (minimal `id`/`name` seed, `scripts/sync/states.mjs` — a structural
  prerequisite for `terms`/`districts`' FKs into `states`, not the Phase 2 geography sync) and
  `npm run sync:legislators` (`legislators`/`terms`, run `states` first). `sync:districts` is
  still the JSON-stand-in shape (writes `src/data/districts.json`) — deliberately not migrated
  yet, see the districts note below. Sync scripts run as plain Node (`--env-file=.env.local`
  for the Supabase-writing ones — reads `SUPABASE_SERVICE_ROLE_KEY`, never used outside
  `scripts/sync/`), not through Next, so they can't import `src/lib/*.ts` directly; shared
  helpers live in `scripts/sync/_supabase-admin.mjs`. Follow the Supabase-writing shape for
  governors/geography/sports sync scripts later, not the old JSON one.
- **The plan's districts source is stale — don't use it without re-checking.** Plan §3 points
  at `unitedstates/districts` (GitHub) for congressional district boundaries; its last *full
  nationwide* set is from 2016, pre-2020-census redistricting (later folders are single-state
  off-cycle updates only — PA/NC/NJ). Using it would draw wrong shapes/district counts against
  current legislator data. `scripts/sync/districts.mjs` uses the Census Bureau's cartographic
  boundary file for the 119th Congress instead — current, official, still no key needed. If
  `unitedstates/districts` ever gets a real update, it's fine to reconsider, but verify the
  "full nationwide set" year first, the same way this was caught.
- **`districts.mjs`/`districts-geo.ts` are deliberately still on the JSON stand-in** — everything
  else has migrated to Supabase (see the sync script pattern bullet above). The script builds
  one combined TopoJSON topology (~112KB, shared borders) specifically to avoid a ~13MB raw
  GeoJSON blob; the plan's draft `districts.geojson`-per-row schema would throw that size win
  away. Don't migrate this without first deciding the storage format (single topology blob vs.
  per-row geometry) — flag it to the user, per plan §7 step 11.
- **House terms carry `district_number` (plain int) separately from `district_id`** (FK into
  the not-yet-populated `districts` table) — a term needs to record which district regardless
  of whether that district's geometry has synced. `getCurrentRepsByDistrictKey()` and
  `UsMap.tsx`'s district join key off `district_number`, not `district_id`.
- **`races_2026` source decided: Wikipedia infobox parsing, Senate + Governors only.** Plan §3
  — the MediaWiki Action API (`action=parse&prop=wikitext`, no key), reading the per-race
  infobox template (`Infobox U.S. Senate election` etc.), with the page list per chamber pulled
  from a Wikipedia category rather than hand-typed. **House (435 races) is deliberately
  excluded from automated sync** — mostly safe seats with little educational value, and
  per-district current representation already covers House at the level this app cares about;
  hand-curate only the competitive races if House previews are ever wanted. Not built yet.
- **Governors sync source confirmed: OpenStates API v3** (`https://v3.openstates.org/`, now
  under Plural/SAI360 — API still active despite the consumer app being discontinued). Plan §3
  has the full findings; the two that actually shape `governors.mjs` when it's built:
  - No dedicated governors endpoint — use `/people?jurisdiction=<id>&org_classification=executive`
    and filter client-side on `current_role.title === "Governor"`. `/jurisdictions` mixes in
    ~1800 municipalities, so filter to `classification === "state"` first.
  - **Per-state gaps are real, not a bug** — e.g. California's executive results omit a
    `"Governor"` entry entirely despite Newsom being in office. Log/flag missing states in
    `sync_logs` rather than failing or silently showing nothing; maintain a small manual
    override list for known gaps (cheap at ~50 states, unlike the House problem above).
  - `start_date`/`end_date`/`bio_summary` aren't in the v3 API's `Person` schema at all —
    accept as null for the MVP; Wikidata (already planned for Phase 2 geography) is a plausible
    future backfill source, not scheduled now.
- **Derived/joined geometry lives in `src/lib/*-geo.ts`, not in a sync script.** Anything that
  combines two already-synced datasets — `districts-geo.ts` joining district shapes to current
  reps' party, `senate-split-geo.ts` splitting a state's real geometry (via `@turf/intersect`,
  not just its bounding box) into per-senator halves — is computed at read time (client-side for
  `districts-geo.ts`'s static JSON; `senate-split-geo.ts` is now async, fetching current
  senators from Supabase via `getCurrentSenatorsByState()`) and memoized (module-level cache —
  a resolved `Promise` in `senate-split-geo.ts`'s case, so concurrent callers share one fetch),
  not precomputed by a sync script.
- **Reads use `src/lib/supabase.ts`, a `@supabase/postgrest-js` `PostgrestClient`, not the full
  `@supabase/supabase-js`.** The full client unconditionally constructs a `RealtimeClient` that
  needs a WebSocket constructor — Node < 22 (Next.js Server Components run in Node) has no
  native one, and the app has no realtime/auth needs anyway (anon key, RLS-gated, read-only).
  Safe to import from both Server Components and client components. Sync scripts are the
  opposite case (Node-only, write access) — they use `@supabase/supabase-js` via
  `scripts/sync/_supabase-admin.mjs`, which pulls in the `ws` package specifically to satisfy
  that same WebSocket requirement.
- **New Supabase tables need explicit grants, not just an RLS policy.** Supabase's cloud
  default gives a fresh table no Data API access at all — `anon`/`authenticated` need an
  explicit `GRANT SELECT` per table (in addition to an RLS policy) before the browser can read
  it, and `service_role` needs its own grant before sync scripts can write. See
  `supabase/migrations/20260826133022_public_read_access.sql` and
  `..._service_role_grants.sql`. Add the `anon` grant for a table when its read path is
  actually built — don't grant speculatively ahead of that.

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

Most items in plan §9 are now resolved (`OPEN_QUESTIONS.md`):
- **Auth: none, deliberately.** This is a personal-use app — no user accounts/login flow.
  The deployment itself is gated instead: **Vercel Authentication** is enabled on the Vercel
  project (plan §7 step 9) — free, requires being logged into Vercel in the browser. Password
  Protection (a shared password, no Vercel login needed) was the original plan but turned out
  to need Vercel Pro ($150/mo), not worth it here. There's nothing actually sensitive in the
  app's data (all public political/geo sources), so making the deployment public later instead
  is a reasonable option if the login friction isn't worth it — not just a fallback. Revisit
  real app-level auth only if something worth saving per-user (e.g. quiz progress) gets built.
- **Congress history depth: full history everywhere**, same as Senate's existing
  `getSenateHistory()` (back to statehood) — for House and Governors once synced, too. This is
  a UI task, not a scope one: add filtering/structuring (collapse by default, group by decade
  or party, paginate/"show more") on the History tab once those datasets exist, rather than
  capping the data itself.
- **Geography sync sources (Phase 2): Claude Code picks the combination at Phase 2 start** —
  no need to lock in before then. Working default from the plan discussion: Census for
  population (authoritative), Wikidata for capitals/founding dates/structured facts, GeoNames
  as a fallback for city coordinates if needed.
- **Sports sync source: TheSportsDB confirmed** (already the plan's pick, no open question).

Still genuinely open: MapLibre vs Mapbox (recommendation: MapLibre, already in use, no reason
to revisit). Flag it to the user if work ever depends on switching.

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

Base Next.js + Tailwind + TypeScript scaffold in place (App Router, ESLint). Infra checklist
(plan §7) progress: repo pushed to `github.com/filipeoliveira05/geopolitix` (`origin`/`main`);
Supabase project linked via the CLI (run through `npx supabase`, not a project dependency —
credentials in gitignored `.env.local`: `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`,
`SUPABASE_ACCESS_TOKEN`) and the initial schema applied as a versioned migration
(`supabase/migrations/20260826072946_init_schema.sql`, all of plan §4's tables). Vercel
project created and connected (imports the GitHub repo, deploys on push), with Vercel
Authentication enabled as the deployment gate (see Open decisions above for why, not Password
Protection). Supabase env vars wired to both Vercel (Production + Preview) and local
`.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Config type, safe to
expose), `SUPABASE_SERVICE_ROLE_KEY` (Secret type, server-side only — never use client-side).
`states`/`legislators`/`terms` are migrated to Supabase (plan §7 step 11) — the app reads these
live from Supabase now, not JSON. `districts` is still on the JSON stand-in, deliberately (see
Data conventions above); governors/geography/sports sync isn't built at all yet.

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
(placeholder — source now decided, plan §3, but `races_2026` sync itself not built yet).

**Synced data**, all via `npm run sync:<name>`, all public sources, no API keys/accounts:
- `states` table (`sync:states`) — minimal `id`/`name` seed from `us-atlas` +
  `fips-to-abbr.json` (50 states + DC). Population/capital/region null until Phase 2.
- `legislators`/`terms` tables (`sync:legislators`) — current + historical Senate terms (House
  current-only) from `unitedstates/congress-legislators`, read live through
  `src/lib/legislators-data.ts` (`@supabase/postgrest-js`, anon key, RLS-gated). Run
  `sync:states` first — `terms.state_id` is a FK into `states`.
- `districts.json` (`sync:districts`) — still the JSON stand-in, current (119th Congress) House
  district boundaries from the Census Bureau (not `unitedstates/districts` — see Data
  conventions above for why), read through `src/lib/districts-geo.ts`.
- `fips-to-abbr.json` — static FIPS↔state-abbreviation reference table, shared by both scripts
  and `src/lib/state-fips.ts`.

Not started: governors sync (OpenStates), geography/sports sync, `races_2026` data, quiz
(Phase 3). Districts migration to Supabase also not done (deliberately, see Data conventions).
