# Geopolitix — Project Plan: US Politics & Geography Learning App

## 1. Context and Goal

This app was born out of interest in the 2026 US midterm elections and inspiration from CNN's interactive map (built with Mapbox). The goal is **not** to compete with real-time election results services (the CNN app already does that well) — the focus is **educational**: learning about the US political system (House, Senate, Governors, Congress history) and about US state geography (capitals, most populous cities, sports teams).

### Main goals
1. Visually explore, through an interactive map, each state's political representation (senators, representatives, governor) — both current and historical.
2. Provide a "preview" of the 2026 midterm elections: candidates and already-confirmed wins — **without** any pretension of real-time/live results.
3. Learn US geography: capitals, most populous cities per state, sports teams associated with each state/city.
4. Include an active-learning component (quiz) built on top of this data.

### Non-goals (out of scope, at least for the MVP)
- Real-time election results on election night.
- Coverage of local/state elections beyond House, Senate, and Governors.
- Campaign finance, polling, or forecasts.
- User login/personal profiles (to be decided later, if needed, for saving quiz progress).

### Development priority
1. **Phase 1 (main focus):** Politics — House, Senate, Governors, Congress history, 2026 midterms preview.
2. **Phase 2:** Geography — capitals, cities, population, sports teams.
3. **Phase 3:** Active-learning layer (quizzes) on top of data from both previous phases.

---

## 2. Tech Stack

Based on the stack already used in other projects by the user:

- **Frontend/Framework:** Next.js (App Router)
- **Database:** Supabase (Postgres)
- **Version control:** GitHub
- **Deployment:** Vercel, with automatic deploy after push
- **Interactive map:** MapLibre GL JS (open-source fork of Mapbox GL JS — avoids the mandatory API key/cost of Mapbox; alternative: Mapbox GL JS if the Mapbox ecosystem is preferred)
- **Map geometries:** GeoJSON of congressional districts and state boundaries (see data sources section)
- **Periodic data sync:** Supabase `pg_cron` and/or Vercel Cron Jobs, triggering Supabase Edge Functions (or Next.js API routes) that pull from external sources
- **Frontend data fetching/caching:** TanStack Query (React Query)
- **Styling:** Tailwind CSS
- **PWA:** manifest.json + icon, to allow "Add to Home Screen" on mobile (no native app needed)

### Data strategy: sync + manual refresh (not static, not "live")

No hardcoded data in the codebase. The approach is:
1. **Periodic jobs** fetch data from official external APIs/sources and update tables in the Supabase database. Crucially, the sync frequency is **differentiated per table**, not a single blanket cadence — most political/geographic facts (who holds a seat, a state's capital, a city's population) change rarely (on the order of weeks to years), so syncing them daily would just burn API calls and add monitoring overhead for no real benefit. Only the 2026 midterms race data is genuinely time-sensitive as election day approaches. See the frequency table in Section 6 for the per-table breakdown.
2. A **manual refresh button** in the UI allows forcing an immediate pull at any time, for any table (e.g., when the user knows something changed, like a senator resigning or a race that was just "called") — this is available regardless of the automatic cadence, and is the primary mechanism for tables that don't have automatic sync at all (e.g., `districts`, `sports_teams`).
3. The production app **always reads from the Supabase database**, never makes direct calls to external APIs from the user's browser — this avoids rate limits, latency, and dependency on third-party API availability during normal browsing.

**Interim implementation note (current state of the build):** until a Supabase project exists, the sync jobs described above are stood in for by `scripts/sync/*.mjs` scripts — each pulls from one public source (no API key/account required) and writes a committed JSON file into `src/data/` (e.g., `legislators.json`, `districts.json`), run manually via `npm run sync:<name>`. These are dev-time stand-ins for the real Supabase tables + cron jobs, not a permanent architecture choice — the output is treated as any other source-controlled file for now. New sync scripts (governors, geography, sports) should follow this same shape until the Supabase migration happens, at which point each script's logic moves into a Supabase Edge Function / Vercel Cron job writing to Postgres instead of a JSON file, and `sync_logs` becomes a real table instead of implicit.

**Derived/joined geometry is a separate concern from syncing.** Anything computed by combining two already-synced datasets — e.g., joining district shapes to current reps' party, or splitting a state's real geometry (not just its bounding box) into per-senator halves when a state's two senators are of different parties — belongs in `src/lib/*-geo.ts`, not in a sync script. This is computed client-side at read time and memoized (module-level cache), so it recomputes automatically whenever the underlying synced JSON/table changes, with no separate regeneration step to remember to run.

---

## 3. Data Sources / APIs

### Politics — Congress (House/Senate), current and historical
- **congress.gov API** (official, Library of Congress) — members, votes, bills, committees. Free, requires an API key, 5,000 requests/hour limit.
- **unitedstates/congress-legislators** (GitHub repo, `github.com/unitedstates/congress-legislators`) — public dataset in YAML/JSON/CSV with every member of Congress since 1789 (party, state, term dates, cross-referenced IDs such as `bioguide_id`, `govtrack_id`). This is the recommended primary source for populating the full historical record without scraping.
  - Note: the **ProPublica Congress API** no longer issues new API keys — not a viable option for a new project.
- **OpenFEC API** — campaign finance data (free, official FEC source) — optional, out of MVP scope.

### Politics — Governors and state legislatures
- **OpenStates API (v3)** — data on state legislatures and state executive offices (governors), free, open source. Research findings (as of this writing):
  - **Org context/caveat:** OpenStates is now operated under **Plural / SAI360** — `openstates.org` redirects to `open.pluralpolicy.com`, where a banner states most consumer-facing tools have been discontinued in favor of a newer commercial Plural app, but the API and bulk data remain active and are explicitly why the site still exists. Practically usable, but this signals the project is in a maintenance/transition phase under a commercial entity rather than a purely independent one — worth periodically re-checking, the same way this plan tracks "last updated" dates for the `unitedstates` org repos.
  - **Account/key:** an account is required. Register at `open.pluralpolicy.com`, then request an API key from the profile page (`/accounts/profile/#apikey`). Free for normal usage volume.
  - **Auth:** pass the key via the `X-API-KEY` header or an `?apikey=` query parameter.
  - **Rate limits:** the default (no-upgrade-requested) tier allows roughly 10 requests/sec and 500 requests/day. This is well above what a weekly sync across all 50 states needs — not expected to be a constraint unless testing is done repeatedly within the same day.
  - **Endpoint shape:** root URL `https://v3.openstates.org/`. There's no endpoint dedicated to governors specifically — use **`/people`**, which the docs describe as covering "a legislator, governor, mayor, etc.," each with a `current` role field, filtered by jurisdiction (OpenStates' term for state). Interactive Swagger/FastAPI docs are available for testing requests before writing sync code.
  - **Confirmed query shape (tested live):** `GET /people?jurisdiction=<State>&org_classification=executive` returns the state's executive-branch officials, each with a `current_role.title` field (e.g. `"Governor"`, `"Lt_Governor"`, `"Attorney General"`, `"Secretary Of State"`) — filter client-side on `title === "Governor"` to get just the governor. `org_classification=upper`/`lower` returns state legislature chambers instead, not the executive.
  - **Confirmed finding: per-state data gaps exist and must be handled gracefully.** Live testing found Texas correctly includes a `"Governor"` entry (Greg Abbott), but California's `executive` results were missing a `"Governor"` entry entirely (Lt. Governor, Attorney General, and Secretary of State were present, the Governor was not) — despite Newsom being in office. This isn't a bug in the query; it's a genuine per-state completeness gap in a crowdsourced, 50-state-aggregated dataset. **Implication for `governors.mjs`:** don't assume every state will return a `Governor` entry — log/flag states where it's missing (rather than failing silently or crashing), so gaps are visible and can be patched manually or re-checked on the next sync, instead of the app silently showing no governor for a state that has one.
  - **High-confidence finding (not treated as absolute certainty): term dates appear to be missing from the v3 REST API's `Person` schema entirely, not just from the sample responses tested.** Live testing of Texas's governor with all five documented `include` values on `/people` (`offices`, `other_identifiers`, `links`, `sources`, `other_names`) returned no term dates; `current_role` is a flattened object with only `title`, `org_classification`, `district`, `division_id`. This was cross-checked against the full `Person`/`CompactPerson` schema definitions in the v3 Swagger/OpenAPI docs — every field is explicitly listed (`birth_date`, `death_date`, `extras`, `offices`, etc.) and none is `start_date`/`end_date`, including inside `current_role` itself. This is stronger evidence than sampling live responses alone, but it stops short of certainty: neither of us wrote this API, so there's no way to be fully sure the rendered Swagger page reflects every field the API can return, or that this won't change in a future version. Treat this as **well-investigated but not proven beyond doubt** — worth re-checking if a future implementation attempt behaves unexpectedly, rather than treated as permanently settled. (For reference: the concept does exist in OpenStates' broader data model, on `MembershipNode`/`PostNode` in the now-deprecated v2 GraphQL API — see below — but that's a different, unsupported API, not a live alternative.) **Implication, unchanged in practice:** plan for the `governors` table's `start_date`/`end_date` fields to not be populated via the v3 REST API in use; treat this as a likely limitation of the current supported API, not of OpenStates' data as a whole. The same reasoning applies to `bio_summary` — no bio field appears in the schema or in any response tested.
  - **Side finding, not for immediate use:** the `sources` field sometimes includes a direct Ballotpedia link per person (e.g. `ballotpedia.org/Dan_Patrick`). Worth remembering as a possible future cross-reference if term dates are ever wanted for governors — but note this reopens the same Ballotpedia fragility/ToS caveat already flagged for `races_2026` in this section, so it's a "know it exists" note, not a recommendation to implement now.
  - **Final sync strategy (synthesizing the findings above):** a two-layer approach, chosen because there are only ~50 states — a small enough number that a manual safety net is cheap to maintain, unlike the 435-race House problem in §3's `races_2026` discussion.
    1. **Primary: automated OpenStates sync.** `governors.mjs` calls `/people?jurisdiction=<id>&org_classification=executive` per state (using `/jurisdictions` filtered to `classification === "state"` to generate the list), filters for `current_role.title === "Governor"`, and populates `name`, `party`, `photo_url` from the result. States where no `"Governor"` entry comes back are logged to `sync_logs` as gaps — flagged, not silently skipped or crashed on.
    2. **Secondary: a small manually-curated override list for known gaps** (e.g. California, confirmed missing at time of testing). Trivial to maintain by hand for a handful of states, unlike attempting the same for hundreds of House races. Re-check occasionally whether OpenStates has filled the gap on its own (it's a crowdsourced dataset that improves over time) and drop the override once it's no longer needed.
    3. **`start_date`/`end_date`/`bio_summary`: accepted as unavailable for the MVP**, left null — doesn't block the core feature (showing who currently holds the office). **Future enrichment idea, not scheduled:** since Phase 2 already plans to use Wikidata for geography, Wikidata also has structured "position held" statements with start/end dates for governors — a plausible secondary source to backfill just these two fields later, without replacing OpenStates as the primary source. Noted here for future reference, not part of the current roadmap.
  - **Confirmed finding: `/jurisdictions` mixes states with ~1800 municipalities — must filter.** The endpoint returns every jurisdiction OpenStates tracks (1857 total), the large majority being municipalities (e.g. "Abilene", "Akron"), not just the ~50–56 states/territories that matter here. Filter results by `classification === "state"` (this includes the 50 states plus DC, Puerto Rico, American Samoa, etc.) before generating the list of `/people` calls, and use each entry's structured `id` field (e.g. `ocd-jurisdiction/country:us/state:tx/government`) as the `jurisdiction` parameter in `/people` rather than a plain name string, to avoid any name-matching ambiguity.

### 2026 midterm elections — candidates and confirmed wins
- There is no free, reliable real-time results API equivalent to the AP's (which is paid and geared toward commercial/media use) — so this data will be treated as "race status" (candidates, whether the race is contested, whether a winner has been confirmed), updated via periodic sync, not as a live feed.
- **Decided source: the Wikipedia MediaWiki Action API (`action=parse&prop=wikitext`, no key needed) reading the per-race infobox** (e.g. `Infobox U.S. Senate election`, `Infobox U.S. House election`, `Infobox U.S. gubernatorial election`), not a scrape of the prose summary pages. The list of race pages per chamber comes from a Wikipedia category (e.g. `Category:2026 United States Senate elections`), not a hand-typed list. There's no explicit "winner confirmed" field — that's inferred from whether the infobox has been updated with a result after election day — and each chamber's infobox template has slightly different parameter names, so each needs its own small parser.
- **Coverage is split by chamber, not uniform:** full sync for **Senate (~35 races) and Governors (~36 races)** — small enough page counts that building/maintaining a parser is worth it, and both chambers are already first-class elsewhere in the app. **House (435 races) is excluded from automated sync in the MVP** — the large majority are safe seats with little educational value in a "race preview," and the existing per-district current-representation feature already covers House at the level the app cares about. If House race previews are wanted later, hand-curate just the competitive races Wikipedia's own overview page already highlights, rather than automating all 435.
- Google Civic Information API was considered but has limited result coverage; mainly useful for contextual data, not adopted for this purpose.

### Boundaries/geometries for the map
- **Census Bureau cartographic boundary files** (current Congress, e.g. 119th) — official, no API key needed, and the source actually in use for congressional district shapes. Preferred over TIGER/Line's full-detail shapefiles for this purpose since the cartographic boundary files are pre-generalized for web/mapping use (smaller, faster to render) while still being official Census data.
- **unitedstates/districts** (GitHub) — was the originally planned source for ready-to-use district GeoJSON, but **turned out to be stale**: its last *full nationwide* set dates to 2016, pre-2020-census redistricting (later folders in the repo are single-state off-cycle updates only, e.g. PA/NC/NJ). Using it as-is would draw wrong shapes/district counts against current legislator data. Not recommended unless it receives a genuine full-nationwide update in the future — verify the "full nationwide set" year before reconsidering it, the same way this was caught.

### `unitedstates` GitHub org — full repository inventory

The `unitedstates` org (github.com/unitedstates) has ~40 repos total; most are old and no longer maintained. `congress-legislators` (used) is one of the few still actively updated. **Before relying on any repo from this org, check its "last updated" date — a majority haven't been touched since 2015–2018 and should be treated as frozen snapshots, not living data sources**, the same way `districts` turned out to be stale (see above).

**Already in use:**
- **`congress-legislators`** — source of `legislators` + `terms` (Senate, current + historical since 1789), via `npm run sync:legislators`. Actively maintained (last updated Apr 2026 at time of writing).

**Not yet used, relevant to the MVP:**
- **`images`** — public-domain photos of Congress members. The schema already has `photo_url` on `legislators`/`governors` but no photo sync exists yet — this fills that gap directly, no cost or scraping needed. Good low-effort next addition. Actively maintained (last updated May 2026).
- **`python-us`** — Python package of state metadata (names, abbreviations, FIPS codes, capitals). Not directly importable (Python, app is Node/TS), but a good source of truth to validate/expand the existing `fips-to-abbr.json`, or to help populate `states` (capitals, regions) in Phase 2. Actively maintained (last updated May 2026).
- **`congress`** — data collectors for legislation, amendments, and votes (bills, roll call votes). Not needed for the current MVP scope (representation + history + districts), but relevant if the app later wants to show "what this legislator voted on" or enrich profiles with legislative activity. Less actively maintained (last updated Oct 2025) but still recent enough to be usable.
- **`districts`** — already discussed elsewhere in this doc: deliberately **not** used, since its last full-nationwide district set is from 2016 (pre-2020-census redistricting); the app uses Census Bureau cartographic boundary files instead. Last updated Oct 2022 — stale, kept here only so the decision not to use it stays documented in one place too.

**Interesting, but not aligned with the current MVP (low priority):**
- **`congressional-record`** — parser for the Congressional Record (floor speeches, debates). Rich material for an eventual "history/context" feature, but outside the current focus (representation + geography). Last updated May 2026 (actively maintained), but low priority regardless given scope.
- **`legisworks-historical-statutes`** — metadata + PDFs of historical US statutes (1789–1951). Interesting for historical depth, but too niche for the MVP. Stale (last updated Apr 2020).
- **`bill-nicknames`** — table of popular bill nicknames (e.g. "Obamacare"). Could be good raw material for Phase 3 quiz trivia, but it's supporting content, not structural data. Stale (last updated Jun 2015).
- **`glossary`** — glossary of US government terms. Nice educational add-on (e.g. a tooltip explaining "whip"), not urgent. Very stale (last updated Apr 2015).
- **`acronym`** — library of government acronyms. Same case as the glossary — nice-to-have, not structural. Very stale (last updated Oct 2015).
- **`APIs`** — a catalog/hub of US government APIs. Useful as a *discovery* tool for other data sources, not as a data source itself. Very stale (last updated Dec 2017).
- **`agency-regions`** — geospatial data on how federal agencies divide up their coverage. Federal geography, but about executive agencies, not House/Senate/Governors — out of scope for now. Very stale (last updated Mar 2016).
- **`statements-of-administration-policy`** — archive of White House Statements of Administration Policy on legislation. Federal executive branch, not state-level — out of scope given the app's focus on Governors/state geography. Actively maintained (last updated Mar 2026), but topically misaligned regardless.
- **`contact-congress`** — reverse-engineered tooling for sending messages to members of Congress via their contact forms. Actively maintained (last updated Aug 2026), but this is an action/advocacy tool, not learning content — doesn't fit an educational app.
- **`inspectors-general`, `BillMap`, `uslaw.link`, `citation`, `congress-votes-servo`, `domains`, `complaints`, `nabors`, `chaplains`, `data-releases`, `scotus-bound-volumes`, `licensing`, `rtyaml`, `data-seal`** — assorted niche tools/datasets (legal citation resolution, Inspector General reports, federal web domains, SCOTUS volumes, YAML tooling infrastructure, etc.), all stale (most last updated 2015–2021) and with no direct connection to House/Senate/Governors representation or state geography. Not expected to be needed for this app.

### Geography
- **US Census Bureau API** — population by state/city, demographic data, periodically updated (free, official).
- **Wikidata (via SPARQL) or Wikipedia REST API** — structured data such as state capitals, most populous cities, founding dates, etc.
- **GeoNames API** — free global geographic database, city coordinates.

### Sports
- **TheSportsDB API** — sports teams by city/state and league (NFL, NBA, MLB, NHL, MLS), free with a reasonable free tier.

---

## 4. Data Model (Conceptual Schema)

> Note: table/field names are starting-point suggestions — adjust during implementation as needed.

### `states`
- `id` (PK, e.g., 2-letter code "CA", "TX")
- `name`
- `capital_city_id` (FK → `cities`)
- `population`
- `flag_url` / associated color (optional, for map theming)
- `region` (e.g., Northeast, Midwest, South, West — useful for filters/quizzes)

### `legislators`
- `id` (PK, use `bioguide_id` as the primary identifier)
- `bioguide_id`
- `govtrack_id`
- `first_name`, `last_name`
- `photo_url`
- `birthday`
- `bio_summary`

### `terms`
Represents a legislator's term — allows a full historical record without duplicating the `legislators` entity.
- `id` (PK)
- `legislator_id` (FK → `legislators`)
- `chamber` (enum: `house` | `senate`)
- `state_id` (FK → `states`)
- `district_id` (FK → `districts`, nullable — only applicable to `house`)
- `party`
- `start_date`
- `end_date` (nullable if current term)
- `is_current` (bool, derivable from `end_date`, but useful as an indexed field for fast queries)

### `districts`
- `id` (PK)
- `state_id` (FK → `states`)
- `district_number`
- `geojson` (district geometry, or a reference to geometry storage)

### `governors`
- `id` (PK)
- `first_name`, `last_name`, `photo_url` (all populated by OpenStates `/people`), `bio_summary` (**not available from OpenStates — see §3; leave null or source elsewhere later**)
- `state_id` (FK → `states`)
- `party` (populated by OpenStates)
- `start_date` (**not available from OpenStates — see §3; leave null or source elsewhere later**)
- `end_date` (nullable if current; same OpenStates limitation as `start_date`)

### `races_2026`
Dedicated table for the "2026 midterms preview" feature. **Populated for Senate and Governors
only in the MVP** (see plan §3 for why House is excluded from automated sync); a House row
would use the same shape if hand-curated competitive races are added later.
- `id` (PK)
- `office` (enum: `house` | `senate` | `governor`)
- `state_id` (FK → `states`)
- `district_id` (FK → `districts`, nullable)
- `candidates` — implemented as a related table, `race_candidates` (`race_id` FK, `name`,
  `party`, `is_incumbent`), not a JSON array column — lets `winner_candidate_id` reference a
  real row instead of duplicating candidate data.
- `status` (enum: `open` | `called`)
- `winner_candidate_id` (FK → `race_candidates`, nullable, filled in when `status = called`)
- `last_synced_at`

### `cities`
- `id` (PK)
- `name`
- `state_id` (FK → `states`)
- `population`
- `is_capital` (bool)
- `latitude`, `longitude`

### `sports_teams`
- `id` (PK)
- `name`
- `league` (enum: NFL, NBA, MLB, NHL, MLS, etc.)
- `city_id` (FK → `cities`)

### Sync support tables
### `sync_logs`
- `id` (PK)
- `source` (e.g., "congress.gov", "openstates", "census")
- `triggered_by` (enum: `cron` | `manual`)
- `started_at`, `finished_at`
- `status` (`success` | `error`)
- `error_message` (nullable)

---

## 5. Page Flow / App Structure

### `/` — Home / Interactive Map
- Map of the US (MapLibre), clickable by state.
- **Two map modes, not three:** "States" (current Senate delegation — the state-level chamber) and "Districts" (current House delegation — the district-level chamber), one color per district/per senator-half. Senate was originally considered as its own third mode but folded into "States", since a state *is* its Senate delegation the same way a district *is* its one House member — this was a deliberate call, not an oversight, and shouldn't be re-split without a reason. A state's two senators can't share one flat fill color the way a district can (a district has one occupant, a state has two), so when a state's senators are of different parties its polygon is clipped into two halves (senior senator top-left, junior bottom-right); same-party states render as one solid color rather than two triangles of the same shade.
- Clicking either mode selects a state (Districts mode additionally tracks which district, outlined on the map and highlighted in the side panel's rep list).
- A future "Geography" mode/toggle (Phase 2) will layer capitals/cities/sports teams onto the same map — not yet built.
- In a political mode: option to highlight states with contested races in the 2026 midterms.

### `/state/[state_id]` — State Page
Organized into tabs:
- **Current representation:** 2 senators, representatives by district (with a district map for the state), governor.
- **History:** list of senators/governors over time for this state.
- **Geography:** capital, most populous cities, population, sports teams.
- **2026 Midterms:** races in this state (if applicable), candidates, status (contested / confirmed).

### `/legislator/[legislator_id]` — Legislator Profile
- Photo, bio, current party.
- Term history (chamber, state/district, dates).

### `/governor/[governor_id]` — Governor Profile
- Similar to the legislator profile, adapted to the state executive office.

### `/midterms-2026` — 2026 Midterms Preview
- Scoreboard-style view: count of confirmed vs. contested seats, split by House / Senate / Governors.
- List/map of featured races.
- The UI should clearly state that **this is not a real-time results service**.

### `/quiz` — Quiz Mode (Phase 3)
- Reuses data already loaded into the tables (no extra data source needed).
- Possible questions: "What is the capital of state X?", "Who is the senior senator of this state?", "Point to state X on the map", "What NFL team is based in this city?", etc.
- Modes: by topic (politics / geography / sports) or mixed.

---

## 6. Data Sync — Periodic Jobs

### Rationale for differentiated frequency

A single blanket sync frequency (e.g., daily for everything) was considered and rejected: most of this data changes rarely.

- **Legislators/governors (current terms):** only change on rare events — death, resignation, special election, start of a new Congress (January of odd years). This happens a handful of times a year at most, not daily.
- **Districts/geometry:** only changes with redistricting, which happens roughly once a decade (or occasionally by court order). Effectively static.
- **Geography (capitals, population, cities):** changes slowly and gradually (census, annual estimates). No reason for frequent syncing.
- **Sports teams:** very rarely changes (relocation, rebranding). Effectively static.
- **`races_2026` (candidates, confirmed wins):** the one genuinely "live" dataset, especially as November 2026 approaches (primaries, candidate withdrawals, races being "called").

Given this, only `races_2026` justifies a tighter automatic cadence, and even that doesn't need to be daily year-round. A manual refresh button remains available for every table regardless of its automatic cadence, for whenever the user knows something changed and doesn't want to wait for the next scheduled run.

| Job | Source | Suggested automatic frequency | Populates |
|---|---|---|---|
| Sync legislators | congress.gov API + unitedstates/congress-legislators | Weekly (or biweekly) | `legislators`, `terms` |
| Sync governors | OpenStates API | Weekly (or biweekly) | `governors` |
| Sync districts/geometry | Census TIGER / unitedstates/districts | Manual only (practically never changes) | `districts` |
| Sync geography | Census Bureau API, Wikidata | Monthly | `states`, `cities` |
| Sync sports | TheSportsDB API | Manual only | `sports_teams` |
| Sync 2026 races (Senate + Governors only) | Wikipedia infobox parsing via MediaWiki API (plan §3) | Weekly normally; can be bumped to daily during key windows (primaries, October/November near election day) | `races_2026` |

Each job should write a record to `sync_logs` to allow diagnostics and, where useful, show information in the UI (e.g., "data last updated X days ago").

---

## 7. Infrastructure Setup Checklist

Practical, ordered checklist for getting from "JSON stand-in" to the real infrastructure
described in this plan. Split by what can be done from any browser/device vs. what genuinely
requires being at the primary machine (where Claude Code runs and the local commits live).

**Can be done now, from any device (browser only):**
1. ~~Create the GitHub repository~~ — **done.**
2. ~~Create the Supabase project~~ — **done.**
3. ~~Work out what's needed to start pulling data from OpenStates~~ — **done, see §3 for account/key process, endpoint shape, rate limits, and the Plural rebrand caveat.**
4. ~~Request a congress.gov API key~~ — **not needed for now.** `congress-legislators` already covers everything currently planned for `legislators` + `terms` (House and Senate, current and historical, no key required). The congress.gov API only becomes relevant if a future feature needs data `congress-legislators` doesn't have — roll call votes, bill text, committee activity (see the `congress` repo entry in §3's org inventory) — which is out of scope for now. Revisit only if/when that feature is actually planned.

**Require the primary machine (where Claude Code runs):**
5. ~~Show the updated `OPEN_QUESTIONS.md` and this plan doc to Claude Code~~ — **done.**
6. ~~Push the existing local commits to the GitHub repository created in step 1~~ — **done**
   (`origin` → `github.com/filipeoliveira05/geopolitix`, `main` pushed and tracked).
7. ~~Create the schema in Supabase as a versioned migration via Claude Code~~ — **done.**
   Supabase CLI run via `npx` (not installed as a project dependency), project linked with
   `supabase link`, schema written as `supabase/migrations/20260826072946_init_schema.sql`
   covering all of §4's tables, applied with `supabase db push`. One draft-schema call made
   during implementation: `races_2026.candidates` modeled as a related table
   (`race_candidates`, FK'd from `races_2026.winner_candidate_id`) rather than a JSON array
   column, so a confirmed winner references a real row instead of duplicating candidate data.
8. Create/connect the Vercel project, importing the GitHub repo — do this **after** step 6, not before: Vercel needs code in the repo to produce a working first deploy.
9. ~~Enable Vercel Deployment Protection~~ — **done.** Password Protection turned out to require
   Vercel Pro ($150/mo) — not worth it for a personal app with no secret data. Using the free
   **Vercel Authentication** instead (visitors must be logged into Vercel and a team member);
   revisit and make the deployment public later if this login friction isn't worth it, since
   there's nothing actually sensitive in the app's data to protect.
10. ~~Connect Supabase environment variables (URL + keys) to both Vercel and local
    `.env.local`~~ — **done.** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    (Config type — safe to expose, the anon key only grants read access governed by RLS) and
    `SUPABASE_SERVICE_ROLE_KEY` (Secret type, no `NEXT_PUBLIC_` prefix — server-side only) are
    set on Vercel (Production + Preview) and in local `.env.local`. Redeployed to pick them up.
    Nothing to verify in the browser yet — the app still reads from the JSON stand-in until
    step 11 migrates the sync scripts.
11. Only after 6–10: have Claude Code migrate the `scripts/sync/*.mjs` JSON stand-ins to real Supabase tables + cron jobs, per the Data strategy in §2.

---

## 8. Suggested Roadmap

> Current build status (what's actually done vs. this roadmap) is tracked in `CLAUDE.md` in the repo, not duplicated here — check there for the up-to-date picture.

1. **Base setup:** initial Supabase schema, Next.js + Tailwind + MapLibre, working Vercel deploy with minimal data (even partially inserted manually to test the map).
2. **Phase 1 — Politics:**
   - Implement `legislators` + `terms` sync (unitedstates/congress-legislators + congress.gov API).
   - Implement `governors` sync (OpenStates).
   - Build the map with a per-state side panel (current representation).
   - Build state and legislator/governor pages.
   - Implement `races_2026` for Senate and Governors (via Wikipedia infobox parsing, per plan §3), and the `/midterms-2026` page. House is out of scope for automated sync in the MVP.
3. **Phase 2 — Geography:**
   - Sync `cities`, `states` (population, capitals) via Census/Wikidata.
   - Sync `sports_teams` via TheSportsDB.
   - Add a "Geography" tab to state pages.
4. **Phase 3 — Active learning:**
   - Build `/quiz` reusing existing data.

---

## 9. Open Decisions (to validate during implementation)

- ~~Definitive source for `races_2026`~~ — **resolved**: Wikipedia infobox parsing via the MediaWiki API, scoped to Senate and Governors only (House excluded from automated sync in the MVP). See §3 for the mechanism and rationale.
- ~~Whether/when to introduce user authentication~~ — **resolved**: no user auth system for
  now (personal-use app, nothing to save per-user yet). The public deployment itself is gated
  by free Vercel Authentication instead (plan §7 step 9), not app-level auth. Revisit only if
  something worth saving per-user (e.g. quiz progress) gets built.
- Final choice between MapLibre GL JS and Mapbox GL JS (recommendation: MapLibre, to avoid dependency on Mapbox API keys/costs).
- Level of detail for Congress history to show in the MVP (e.g., limit to a certain starting year, or include the full record back to 1789).
