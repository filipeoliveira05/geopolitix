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
  `sync:states` first — FK dependency), `governors` (`sync:governors`, needs
  `OPENSTATES_API_KEY` in `.env.local`), and `governor_terms` (`sync:governor-history`, no key
  — see below). App reads through `src/lib/supabase.ts`, a
  `@supabase/postgrest-js` `PostgrestClient` — not the full `@supabase/supabase-js`, whose
  `RealtimeClient` needs a WebSocket constructor Node < 22 lacks natively, and this app has no
  realtime/auth needs. Sync scripts (Node-only, write access) use `@supabase/supabase-js` + the
  `ws` package via `scripts/sync/_supabase-admin.mjs`.
- **`governors.mjs` — full source research/gotchas are in plan §3, don't re-derive them.** The
  two that bite hardest if forgotten: party strings need `normalizeParty()` (OpenStates'
  `"Democratic"` → our `"Democrat"`) or Democrat governors silently render `(?)` badges; and
  OpenStates' rate limit is much stricter in practice than its docs suggest (sustained 429s
  taking minutes to clear, not seconds — expect this if re-running repeatedly in one session).
- **`governor-history.mjs` — full source research (a real Wikidata SPARQL spike, not guessed)
  is written up in the script's own header comment, don't re-derive it.** Shaped like
  `race_candidates` (plain `name`/`party`, no required FK to a person table) rather than
  `terms` — historical governors predate OpenStates entirely and have no `legislators.id`-style
  natural key to hang a required FK off of; `governor_id` is nullable and only set on a state's
  current term row. The two gotchas that bite hardest: a person's party (P102) statements
  aren't date-scoped to the specific term being synced, so a party-switcher shows up against
  every term they ever held unless resolved by matching the statement's own P580/P582 dates
  client-side (`resolveParty()`); and Wikidata occasionally has a genuine duplicate P39
  statement for the same person/term (confirmed: NJ's A. Harry Moore), which crashes a
  same-batch upsert with "ON CONFLICT DO UPDATE command cannot affect row a second time" unless
  de-duped by `(state_id, wikidata_person_id, start_date)` first.
  **Second pass (`backfillBios()`) fills `photo_url`/`bio_summary`** for every distinct person
  from the Wikipedia REST API (`/api/rest_v1/page/summary/<title>`), not Wikidata's own
  P18/description — confirmed live to read noticeably better, e.g. a real sentence vs.
  Wikidata's "American politician (1812-1883)". Coverage confirmed live across the *entire*
  synced set, not sampled: 2,287/2,288 people (99.96%) — the one exception has no Wikipedia
  article on Wikidata at all, a genuine permanent gap, not a bug. Filters on `bio_summary is
  null` (not `photo_url`) to decide who still needs work — ~30 people legitimately have no
  Wikipedia thumbnail but do have a real extract, and filtering on `photo_url` would re-fetch
  them forever. Powers `/governor/[id]` for historical governors too (see below) — this is the
  only place their photo/bio come from, since OpenStates only ever has current people.
  **Real gotchas hit running this at full scale, not just the 3-state research spike:**
  Wikipedia's REST API rate-limits under sustained concurrent load (429s survived 8 states at
  concurrency 8, then more at concurrency 3 — settled on 2); a `fetch()` can hang with no
  timeout and sit frozen indefinitely with zero progress/error (added `AbortSignal.timeout()`
  after a real 40+-minute stall); and Wikidata's own SPARQL label service falls back to
  emitting the bare entity id (e.g. `"Q651820"`) as the "label" when a person genuinely has no
  English label at all — confirmed via Wikidata's raw entity JSON showing `labels.en: null` for
  Bill Owens (CO governor 1999-2007) despite a full Wikipedia article existing. `backfillBios()`
  detects and repairs this (`BARE_QID_PATTERN`) using the already-resolved Wikipedia article
  title, and self-heals any future occurrence via a `name ~ '^Q[0-9]+$'` filter, not just a
  one-off fix for the 3 people found this way so far.
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
- **`src/lib/us-insets.ts` repositions Alaska/Hawaii into fixed insets south of California**
  (CNN-style, not geographically real) rather than their real antimeridian-crossing location —
  applied once to raw `us-states-geo` geometry, consumed by both `senate-split-geo.ts` and
  `districts-geo.ts` so states mode/districts mode agree on where they are. `state-labels-geo.ts`
  (state abbreviation label points, via `polylabel`'s pole-of-inaccessibility — a plain centroid
  can land outside an irregular state like Michigan or Louisiana) reads the same remapped
  geometry so labels land on the insets too.
- **`isPrimaryPending()` in `races-data.ts`** detects Wikipedia's own placeholder text
  ("TBD"/"`<name> (presumptive)`") already flowing through the unchanged `races_2026` sync —
  used to show a clean disclaimer instead of that raw text. No new data source or sync change;
  self-updates once a state's real primary results land in the next weekly sync.

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
- **Map framing:** `UsMap.tsx` sets `renderWorldCopies: false` + a generous `maxBounds` so
  zooming out doesn't show the Mercator world wrapped/repeated. Keep `maxBounds` generously
  larger than `US_BOUNDS`, not just padded — a narrow/portrait mobile viewport's `fitBounds`
  naturally reveals a lot of extra latitude beyond the bounds' own box, and a too-tight
  `maxBounds` forces MapLibre to zoom in past what `fitBounds` asked for to stay inside it,
  cropping the initial view on phones (hit this once; fixed by widening `MAX_PAN_BOUNDS`).
  State abbreviation labels are DOM `Marker`s, not a MapLibre symbol layer — a symbol layer's
  text needs a `glyphs` (SDF font) URL wired into the style, which would mean depending on an
  external glyph server at runtime; markers just need CSS and get free light/dark theming.
- **Tabular data (history lists, race lists) uses a real `<table>`, not a flex/list layout** —
  a flex row lets candidate/date text wrap unpredictably per row so nothing lines up. Wrap the
  table in `overflow-x-auto overflow-y-hidden` — **not just `overflow-x-auto` alone**: per the
  CSS spec, leaving `overflow-y` unset while `overflow-x` isn't `visible` silently computes
  `overflow-y` to `auto` too, which trapped a tiny vertical scroll on `StateTabs`' tab bar
  before this was caught. Same pattern for horizontally-scrolling non-table content.
- **"Live/pending" indicator convention:** a small `animate-pulse` colored dot — amber for a
  not-yet-decided race or the midterms countdown, emerald for "this is the current officeholder"
  in history tables. Place it `inline-block` with `align-middle` next to text that might wrap
  (not a `flex items-center` sibling) — flex-centering against a block that wraps to two lines
  misaligns the dot against the wrapped text; inline keeps it pinned to the line it's actually on.

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
and reading live from Supabase; infra (below) is fully automated too. A post-Phase-1 UX polish
pass (mobile responsiveness, map framing, table formatting — see below and UI conventions) and
a data-completeness pass (governor history, loading/error states) has since shipped on top of
it. Next up per the build order is Phase 2 (geography/sports sync), unless told otherwise.

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
**`legislators.bio_summary`/`photo_url` backfill runs on its own separate, much more frequent
schedule** (`.github/workflows/legislator-bio-backfill.yml`, every 3 hours + manual
`workflow_dispatch`) rather than riding along on the weekly sync — the population here (~12,700
legislators, current + full House/Senate history) makes one full pass take multiple days even
at the deliberately low concurrency Wikipedia's REST API needs (see `legislators.mjs`/
`_wikipedia.mjs` comments — going higher reliably produces more 429s, not fewer, same lesson
`governor-history.mjs` already learned). Each run sets `LEGISLATORS_BACKFILL_ONLY=true`
(skips resyncing `legislators`/`terms` from congress-legislators entirely — that stays on the
weekly cadence — since the Wikipedia article title needed for the backfill comes from the same
YAML fetch regardless) and `BACKFILL_BUDGET_MS` (20 min) so a run stops cleanly and picks up
next time rather than trying to process the whole backlog in one sitting; self-healing via the
same `bio_summary IS NULL` filter as everywhere else in this codebase, so a missed/overlapping
run is harmless. `mapWithConcurrency` (`_wikipedia.mjs`) grew a `shouldStop` hook for this.
**A real hang was hit and fixed building this**: `withHardTimeout` (`_wikipedia.mjs`) went
through two broken versions before converging — v1 raced a promise against a timer but never
cancelled the original work, so abandoned retry chains piled up and progressively stalled later
items; v2 dropped the race in favor of an AbortSignal for `fn` to observe, but a caller that
didn't actually thread the signal through (legislators.mjs's Supabase `update()` call site) got
zero timeout protection at all. The final version does both — a real `Promise.race` guarantees
the outer `await` settles by `ms` regardless of whether `fn` honors the signal, and `fn` still
receives the signal so a fetch()-based caller can actively cancel its in-flight request.
Remaining: geography/sports sync (Phase 2).

**Home page** (`src/app/page.tsx` + `UsMap.tsx`): interactive MapLibre map, two modes (see UI
conventions) — States (default, current Senate delegation) and Districts (current House
delegation). Clicking either selects a state (Districts additionally tracks which district).
Zoom +/- buttons bottom-right; Alaska/Hawaii insets and state abbreviation labels always
visible in both modes (see Data/UI conventions). The side panel (`StatePanel.tsx`) shows real
governor/senators/House reps (Supabase, via TanStack Query) and mock capital/population
(`src/lib/mock-states.ts`, only CA/TX/NY/FL populated), a close (×) button to deselect, and a
link to the full state page. On mobile the panel is a capped-height (`45vh`), independently
scrolling bottom sheet rather than pushing the map off-screen.

**`/state/[abbr]` page** (`src/app/state/[abbr]/page.tsx` + `StateTabs.tsx`): four tabs per
plan §5 — current representation (real, including governor); history (real Senate AND governor
history back to statehood as aligned tables, current officeholder marked with a dot rather than
"(current)" text — see UI conventions; House history still out of scope, no equivalent to
`getSenateHistory()` exists for it); geography (mock, cities/sports flagged "Phase 2, not built"); 2026 midterms
(real — Senate/Governor races for this state, per-candidate party + incumbent flag; House out
of scope; a race with an unresolved primary shows a disclaimer instead of raw candidate text —
see `isPrimaryPending()` above).

**`/midterms-2026`** (plan §5): aligned per-office race tables (state | candidates), linked from
the map's top-right corner. Every race resolves the same day (Nov 3, 2026), so the top cards
show a day-countdown + primaries-held count pre-election rather than a called-count stuck at
0/N for months; they switch to the real called-count automatically once that date passes (see
`getElectionCountdown()`/`isPrimaryPending()` in `src/app/midterms-2026/page.tsx`).
`force-dynamic` — no dynamic route params here to make Next treat it as needing per-request
data automatically, so without this it would prerender once at build time and serve stale race
data forever (caught before shipping, not after).

**`/legislator/[id]`** and **`/governor/[id]`** (plan §5): photo, party, term history for one
person — legislator term history from `terms`. `/governor/[id]`'s `id` resolves two different
ways (`loadProfile()`): a current officeholder's `governors.id` (OpenStates) first, falling
back to treating `id` as a historical governor's `wikidata_person_id` if that lookup returns
nothing — the two id formats never collide, so this fallback is safe. A current officeholder's
photo/bio still come from `governors` (OpenStates, usually null for bio); a historical
governor's come from `governor_terms` (Wikipedia-backfilled, see above — in practice richer,
since OpenStates never provides a bio at all). Term history comes from `getTermsForGovernor()`
(current) or `getTermsForPerson()` (historical), both matched via `wikidata_person_id` so a
non-consecutive past term by the same person also shows, not just one term. `StateTabs.tsx`'s
History tab links every governor row this way too, current or historical — same as Senate
history already does for every senator. `id` is `legislators.id`
(`bioguide_id`) / `governors.id` (OpenStates person id with its `"ocd-person/"` prefix stripped
at sync time — the raw id contains a `/`, which broke the route; caught via a real 404 in
browser verification, not assumed). Linked from senator/rep/governor names across
`StatePanel.tsx`/`StateTabs.tsx`/`RepresentativesList.tsx`.

**Synced data**, via `npm run sync:<name>`:
- `states` — minimal id/name seed (`us-atlas` + `fips-to-abbr.json`), 50 states + DC.
- `legislators`/`terms` — current + full historical House and Senate terms, from
  `unitedstates/congress-legislators`. `bio_summary`/`photo_url` backfill from Wikipedia runs on
  its own frequent schedule (see the GitHub Actions note above) since the ~12,700-person
  population takes multiple days to converge — check progress via `legislators.bio_summary is
  not null` count, not `photo_url` (always set to a guessed `unitedstates/images` URL upfront,
  regardless of backfill progress).
- `governors` — current governor per state, from OpenStates v3 (`OPENSTATES_API_KEY` required).
  See the Data conventions gotchas above before re-running or modifying this one.
- `governor_terms` — full governor history back to statehood, from Wikidata (2,426 rows across
  50 states, no key), plus photo/bio for 2,287/2,288 distinct people (99.96%) from the
  Wikipedia REST API. See the Data conventions gotchas above before re-running or modifying
  this one.
- `races_2026`/`race_candidates` — Senate + Governor races, from Wikipedia (71 races, no key).
  See the Data conventions gotchas above before re-running or modifying this one.
- `districts` (metadata table) + `district-geometry/topology.json` (Storage blob) — current
  (119th Congress) House boundaries from the Census Bureau, 436 districts. See the Data
  conventions note above on why geometry isn't a table column.
- `fips-to-abbr.json` — static FIPS↔abbreviation table, shared by multiple scripts and
  `src/lib/state-fips.ts`.

Not started: geography/sports sync, quiz (Phase 3).
