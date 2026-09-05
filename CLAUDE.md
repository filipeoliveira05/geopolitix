# Geopolitix

US politics & geography learning app. Full project plan (goals, data sources, schema, sync
strategy, page flow, roadmap) lives in **`geopolitix-app-plan.md`** — read it before doing any
non-trivial work here; this file holds operating conventions and current build state.

This file is deliberately kept lean — it's loaded into every session's context, so it holds
*rules you must not violate* and a *condensed current-state summary*, not the full "how we got
here" narrative. The detailed history (every gotcha, every design decision, every bug caught
along the way) lives in four reference docs under `docs/`, each pointed to from the relevant
section below:

- **`docs/data-sync-notes.md`** — full per-sync-script design history and gotchas.
- **`docs/ui-notes.md`** — full UI/design-system decision history.
- **`docs/status-history.md`** — full page-by-page and infra build narrative.
- **`docs/quiz-notes.md`** — full quiz architecture and every category's question-type batch writeup.

Open the relevant doc before modifying the area it covers — don't re-derive research or
re-litigate a decision already documented there.

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
- PWA manifest ("Add to Home Screen") — `public/manifest.json` + a deliberately no-op
  `public/sw.js` (registered from `layout.tsx`, deferred to `window.load`) satisfy Chrome's
  installability check without actually caching anything — this app always reads live Supabase
  data, so an offline app shell would just show stale/broken content. Icons in `public/icons/`
  are generated via `sharp` from the source `geopolitix-logo.png` at the repo root — no standing
  script, regenerate by hand from that source if the logo ever changes.

## Data conventions

- **No hardcoded political/geographic data** — everything lives in Supabase, populated by
  `scripts/sync/*.mjs` (one script per source, run manually via `npm run sync:<name>`; most need
  no API key, `governors` is the exception — needs `OPENSTATES_API_KEY`). Schema draft is plan
  §4 — adjust as implementation reveals better shapes, keep the plan doc in sync if the model
  changes meaningfully.
- App reads through `src/lib/supabase.ts`, a `@supabase/postgrest-js` `PostgrestClient` — not
  the full `@supabase/supabase-js`, whose `RealtimeClient` needs a WebSocket constructor Node < 22
  lacks natively, and this app has no realtime/auth needs. Sync scripts (Node-only, write access)
  use `@supabase/supabase-js` + the `ws` package via `scripts/sync/_supabase-admin.mjs`.
- **Migrated tables:** `states`, `legislators`/`terms`, `governors`, `governor_terms`,
  `races_2026`/`race_candidates`, `candidates`, `districts` (metadata only — geometry lives in a
  Supabase Storage blob, `district-geometry/topology.json`), `cities` +
  `states.population`/`region`/`flag_url`/`capital_city_id`, `sports_teams`,
  `college_football_programs`, `college_basketball_programs`. **See
  `docs/data-sync-notes.md` for the full per-script sourcing research, design history, and every
  real gotcha caught building/running each one** — read the relevant entry before re-running or
  modifying a sync script; several (`governors.mjs`, `governor-history.mjs`, `races-2026.mjs`)
  have real rate-limit/retry/dedup subtleties that are easy to reintroduce.
- **Standing rules that recur across sync scripts and app queries, easy to violate again:**
  - **PostgREST ambiguous-FK embeds need explicit disambiguation**
    (`table!fk_constraint_name(...)`, never the bare table name) whenever two tables have more
    than one FK between them (hit repeatedly: `race_candidates`↔`races_2026`, `cities`↔`states`).
    The failure mode is worse than a normal error — PostgREST returns an HTTP 300 that
    `supabase-js` doesn't surface as a thrown error, so the query promise just never resolves
    (a permanently-stuck "Loading…" with zero console error).
  - **New Supabase tables need an explicit `GRANT`, not just an RLS policy** — Supabase's cloud
    default gives a fresh table no Data API access at all. Add the `anon` `SELECT` grant when a
    table's read path is actually built; `service_role` already has a blanket grant for sync
    scripts, but that blanket grant only covers tables that existed at the time it was written —
    a new table needs its own follow-up grant migration.
  - **Sync scripts insert-then-cleanup (or diff-based upsert), never blind delete-then-insert** —
    a partial failure mid-run must never leave a table incomplete. Most scripts stamp
    `last_synced_at` on each fresh row first, then delete only rows stamped before this run once
    the whole set succeeds; `cities` is the one exception (full per-state delete-then-reinsert,
    safe because nothing else holds a stable FK into it across runs).
  - **Manual Wikipedia-bio verification** (`wikipedia_verified`/`wikipedia_checked_no`/
    `wikipedia_title` columns on `candidates`/`legislators`/`governors`/`governor_terms`) — only a
    human sets either flag, never an automated backfill. `WikipediaVerifiedBadge`/
    `WikipediaNoPageBadge`/`WikipediaSourcedBadge` (`src/components/WikipediaVerifiedBadge.tsx`)
    render whichever is true.
  - **`src/lib/pending-primary-states.ts` is a small, self-expiring hardcoded list** of states
    with a known-pending 2026 primary — check it's still accurate (or trim expired entries) when
    touching anything primary/race-related.
- Derived/joined geometry (`src/lib/*-geo.ts`) is computed at read time and memoized, not
  precomputed by a sync script. `src/lib/us-insets.ts` repositions Alaska/Hawaii into fixed insets
  south of California (CNN-style, not geographically real); `senate-split-geo.ts`/
  `districts-geo.ts`/`state-labels-geo.ts` all consume the same remapped geometry so every map
  mode agrees on where they are.
- **`isPrimaryPending()` in `races-data.ts`** detects Wikipedia's own TBD/presumptive placeholder
  text to show a clean disclaimer instead of raw placeholder text — can't catch every case (a
  genuinely-uncontested race with one real name looks identical to "hasn't voted yet"), which is
  exactly why `pending-primary-states.ts` above exists as a small explicit exception list.

## UI conventions

- **Design system ("Congressional Record" civic-almanac):** CSS custom-property tokens in
  `globals.css` — `--paper`/`--surface`/`--ink`/`--muted`/`--rule`/`--seal`/`--seal-soft`, mapped
  into Tailwind v4's `@theme inline` block as ordinary utilities (`bg-paper`, `text-ink`,
  `border-rule`, etc.). **These are already theme-aware — never pair one with a `dark:` Tailwind
  variant**; only genuinely semantic non-token colors (party colors below, the amber/emerald/sky
  pulse-dot conventions, error red) still need explicit `dark:` pairs. Three font roles via
  `next/font/google`: `font-display` (Fraunces — headings, person names, big numbers only),
  `font-sans` (IBM Plex Sans, the `body` default — don't add the class explicitly), `font-mono`
  (IBM Plex Mono — dates, tallies, sync timestamps, any tabular numeric column; mono only the
  number itself, not a full phrase). Radius is plain Tailwind `rounded` (4px) everywhere, never
  `rounded-md`/`-lg`/`-xl`; no `box-shadow` on any surface (the `SearchOverlay` backdrop scrim is
  the one exception). Shared primitives: `Card`, `SectionHeading` (the `§`-prefixed eyebrow label
  — deliberately reconsidered against alternatives and kept as-is, don't re-litigate),
  `BackToMapLink`. The `.link-accent` utility class replaces bare `hover:underline` on in-content
  text links. `.animate-fade-in` gives each top-level page's outer container a brief mount fade —
  applied once per page, not per-element (also reused per-question in the quiz, see
  `docs/quiz-notes.md`). `.animate-pop-in` (scale 0.9→1 + fade) is the equivalent for a small
  element's entrance, e.g. a button that only appears after an action — both respect
  `prefers-reduced-motion`. **Full design rationale, plus two real rendering bugs
  (a collapsing-space gotcha, an SSR/client locale hydration mismatch) in
  `docs/ui-notes.md`.**
- **Party colors, fixed across the app:** Democrat blue (`#2563eb`), Republican red (`#dc2626`),
  Independent/other grey (`#71717a`). Single source of truth: `src/lib/party-colors.ts`
  (`PARTY_COLORS`, `partyStyle()`), consumed by `PartyBadge.tsx` and `UsMap.tsx`'s
  `partyFillColor()`. Don't hardcode a party hex/class anywhere else.
- **Map has two modes, not three:** "States" (Senate) and "Districts" (House) — don't re-split
  without being asked. A state's two senators can't share one flat `fill-color` —
  `senate-split-geo.ts` clips the state's real polygon into two halves only when the senators
  differ in party (deliberate, explicit user call — don't revert without asking). `UsMap.tsx` sets
  `renderWorldCopies: false` + a generous `maxBounds` so zooming out doesn't show the Mercator
  world wrapped/repeated; keep `maxBounds` generously larger than `US_BOUNDS`, not just padded, or
  a portrait mobile viewport's `fitBounds` gets cropped. State abbreviation labels are DOM
  `Marker`s, not a MapLibre symbol layer (avoids depending on an external glyph server).
- **Tabular/horizontally-scrolling content uses a real `<table>` (or a non-wrapping row) wrapped
  in `overflow-x-auto overflow-y-hidden`** — never `overflow-x-auto` alone (per the CSS spec,
  `overflow-y` silently computes to `auto` too, trapping an unwanted vertical scroll). Same
  pattern applies to any flex row that could wrap unpredictably (e.g. a conference badge next to
  a team name).
- **"Live/pending" indicator convention:** a small `animate-pulse` colored dot — amber for a
  not-yet-decided race or the midterms countdown, emerald for "this is the current officeholder"
  in history tables. Place it `inline-block` with `align-middle` next to text that might wrap, not
  a `flex items-center` sibling.
- **Data-freshness indicators** (`SyncFreshnessNote`/`SyncFreshnessRow`, `src/lib/sync-freshness.ts`):
  small muted "X synced Y ago" text reading `sync_logs`. Two levels — per-job on hub pages
  (`/state/[abbr]`, `/midterms-2026`), per-row on individual entity pages (each table with its own
  detail page carries its own `last_synced_at`). **Full design history (including why an earlier
  `GlobalFooter` design was deleted entirely as actively misleading) in `docs/ui-notes.md`.**
- **`GlobalHeader`** is a persistent header shown on every route (`src/app/layout.tsx`) — carries
  "Midterms 2026"/"Quiz" nav links and the global search icon. **Global search** (`SearchOverlay`)
  matches client-side against a pre-fetched flat index (`src/lib/search-index.ts`) via Fuse.js —
  legislators, governors, candidates, states, sports teams, and college programs. Full design
  history for both in `docs/ui-notes.md`.

## Open decisions

- **Auth: none.** Personal-use app — the *deployment* is gated by free Vercel Authentication
  instead (not Password Protection, which needs Vercel Pro/$150mo). Revisit real app-level
  auth only if something worth saving per-user (quiz progress) gets built.
- **Congress history: full depth everywhere**, matching Senate's `getSenateHistory()`. Capping
  is a UI task (collapse/paginate once House/Governors history exists), not a data-scope one.
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

**All three phases are complete.** Phase 1 (politics) shipped first, fully automated; Phase 2
(geography/sports) shipped 2026-08-31, extended 2026-09-02 with logos/bios and individual
team/program pages; Phase 3 (quiz) shipped 2026-09-03 across 5 incremental plans and has since
grown well past its v1 scope through several same-day question-type-expansion sessions (see
`docs/quiz-notes.md`). A full visual design-system overhaul shipped 2026-08-31 on top of all of
this — the app's actual pages/data/routing are unchanged by it.

**Profile data coverage (name/photo/bio/term history) — a living snapshot, not a one-time claim;
re-check the actual counts before trusting old numbers here:**

| | Name | Photo | Bio | Term history |
|---|---|---|---|---|
| **Governor, current** | ✅ | ✅ 50/50 (100%) | ✅ 50/50 (100%) | ✅ full non-consecutive history |
| **Governor, past** | ✅ | ✅ 2,229/2,287 (97.5%) | ✅ 2,287/2,287 (100%) | ✅ full history |
| **Senator/Rep, current + past (shared pool)** | ✅ (100%) | ⚠️ guessed-URL/Wikipedia-fallback, not separately measured | ✅ 12,712/12,712 (100%) | ✅ full, all chambers |

One known gap class, not a bug: a legislator whose `congress-legislators` entry has no
`wikipedia` field at all can't be resolved by the automated backfill (same class of gap as
OpenStates' missing Governor entries). Fixed by hand on a case-by-case basis when found — see
`docs/status-history.md` for the one confirmed instance and the fix.

**Infra:** GitHub repo tracked; Supabase project linked via CLI; schema applied as versioned
migrations (`supabase/migrations/`); Vercel project connected with Vercel Authentication as the
deployment gate. Sync automation runs via GitHub Actions (not Vercel Cron — `governors.mjs`'s
rate-limiting is tight against Vercel's 300s function timeout), four workflows: `politicians-sync.yml`
(weekly), `races-sync.yml` (its own cadence, `RACES_SCOPE=pending`), `candidate-bio-backfill.yml`
(every 3 hours), `sports-sync.yml` (`workflow_dispatch` only, no recurring schedule). `districts`
stays manual-only (redistricting is ~once/decade). Needs three repo secrets:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENSTATES_API_KEY`. Each sync step runs
independently (`continue-on-error`) but a final step re-checks outcomes and fails the run if any
step genuinely errored. **Full workflow history/design reasoning in `docs/status-history.md`.**

**Pages** (full per-page build narrative, including every real bug caught, in
`docs/status-history.md`):
- **`/`** (`page.tsx` + `UsMap.tsx`) — interactive map, States/Districts modes, year travel
  (repaints with a past Congress's actual winners using historical `terms` data), a party-control
  tally in the legend, a side panel with real governor/senators/reps.
- **`/state/[abbr]`** (`StateTabs.tsx`) — four tabs: current representation, history (Senate/House/
  Governor back to statehood), geography (capital/population/cities/sports teams, pro + college),
  2026 midterms (Senate/Governor/House races for this state).
- **`/midterms-2026`** — aligned Senate/Governor race tables plus a genuinely-lazy House section
  (435 races, grouped by state, only fetches a state's candidates once expanded).
- **`/legislator/[id]`, `/governor/[id]`, `/candidate/[id]`** — photo/party/term-history profile
  pages; a governor's `id` resolves either an OpenStates person or a historical
  `wikidata_person_id`; a candidate's `id` is a stable slug, not a uuid.
- **`/team/[id]`, `/college-football/[id]`, `/college-basketball/[id]`** — one shared
  `TeamProfile` component for all three tables' individual pages (logo, bio, home city link, own
  `last_synced_at`).
- **`/quiz`, `/quiz/[category]`** — five categories (Geography, Officeholders, 2026 Midterms,
  Sports, Mashups), each a mix of multiple-choice/map-click/search-and-select question types plus,
  for Sports and Mashups, an extra matching-pairs/speed-round session type. Search-and-select
  (added 2026-09-05) is a type-and-pick-from-live-search format — Geography (cities, and now also
  state borders), Officeholders (senators), Midterms (candidates), Sports (teams) — scored by
  partial credit; every session is now scored 0-100 points (10/question, shown via an animated
  segmented progress header, not a plain "Question X of 10 — Score: Y" caption) rather than a
  plain right-count, and a start-screen format picker lets the player choose which formats appear.
  Geography also has two shape-guessing multiple-choice types (state-silhouette, state-border)
  rendered as an inline theme-aware SVG computed from the same real `us-atlas` polygon geometry the
  interactive map itself uses — no new synced image or table. **Full architecture, every
  category's question-type batch writeup, and every real bug caught building it (a Strict-Mode map
  cleanup bug, a speed-round timer/setState bug, a PostgREST ambiguous-FK bug, a search-index
  answer-spoiler bug, a population-reveal line-wrap bug, an antimeridian/Four-Corners geometry
  gotcha) are in `docs/quiz-notes.md`** — read it before adding a new question type to any
  category.

**Synced data**, via `npm run sync:<name>`: `states`, `legislators`/`terms`, `governors`,
`governor_terms`, `races_2026`/`race_candidates`, `candidates`, `districts` (+ Storage geometry
blob), `geography` (`cities` + state population/region/flag/capital), `sports` (`sports_teams`,
7 leagues), `college_football` (`college_football_programs`, 138 programs), `college_basketball`
(`college_basketball_programs`, 365 programs). All confirmed at or near 100% logo/bio coverage as
of their last full sync — see `docs/data-sync-notes.md` for exact figures and remaining
known-genuine gaps (a small number of schools/people with no Wikipedia logo/bio at all, closed by
hand where found).
