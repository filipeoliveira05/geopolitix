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

---

## 3. Data Sources / APIs

### Politics — Congress (House/Senate), current and historical
- **congress.gov API** (official, Library of Congress) — members, votes, bills, committees. Free, requires an API key, 5,000 requests/hour limit.
- **unitedstates/congress-legislators** (GitHub repo, `github.com/unitedstates/congress-legislators`) — public dataset in YAML/JSON/CSV with every member of Congress since 1789 (party, state, term dates, cross-referenced IDs such as `bioguide_id`, `govtrack_id`). This is the recommended primary source for populating the full historical record without scraping.
  - Note: the **ProPublica Congress API** no longer issues new API keys — not a viable option for a new project.
- **OpenFEC API** — campaign finance data (free, official FEC source) — optional, out of MVP scope.

### Politics — Governors and state legislatures
- **OpenStates API** — data on state legislatures and state executive offices (governors), open source and free.

### 2026 midterm elections — candidates and confirmed wins
- There is no free, reliable real-time results API equivalent to the AP's (which is paid and geared toward commercial/media use) — so this data will be treated as "race status" (candidates, whether the race is contested, whether a winner has been confirmed), updated via periodic sync, not as a live feed.
- Possible sources to evaluate at implementation time: structured Wikipedia pages (via API/REST), Ballotpedia (via careful scraping respecting terms of use), or manual/semi-manual entry of confirmed candidates as a fallback for the MVP.
- **Google Civic Information API** — official civic/election information, free, but result coverage is limited; mainly useful for contextual data (not results).

### Boundaries/geometries for the map
- **Census TIGER/Line** (US Census Bureau) — official shapefiles/GeoJSON for states, counties, and congressional districts.
- **unitedstates/districts** (GitHub) — ready-to-use GeoJSON for congressional districts (simpler to integrate than raw TIGER data).

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
- `first_name`, `last_name`, `photo_url`, `bio_summary`
- `state_id` (FK → `states`)
- `party`
- `start_date`
- `end_date` (nullable if current)

### `races_2026`
Dedicated table for the "2026 midterms preview" feature.
- `id` (PK)
- `office` (enum: `house` | `senate` | `governor`)
- `state_id` (FK → `states`)
- `district_id` (FK → `districts`, nullable)
- `candidates` (array/related table: name, party, incumbent yes/no)
- `status` (enum: `open` | `called`)
- `winner_candidate_id` (nullable, filled in when `status = called`)
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
- Toggle between "Politics" mode and "Geography" mode (affects what's highlighted/colored on the map and the side panel).
- In Politics mode: option to highlight states with contested races in the 2026 midterms.

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
| Sync 2026 races | Source TBD (Wikipedia/Ballotpedia/manual) | Weekly normally; can be bumped to daily during key windows (primaries, October/November near election day) | `races_2026` |

Each job should write a record to `sync_logs` to allow diagnostics and, where useful, show information in the UI (e.g., "data last updated X days ago").

---

## 7. Suggested Roadmap

1. **Base setup:** initial Supabase schema, Next.js + Tailwind + MapLibre, working Vercel deploy with minimal data (even partially inserted manually to test the map).
2. **Phase 1 — Politics:**
   - Implement `legislators` + `terms` sync (unitedstates/congress-legislators + congress.gov API).
   - Implement `governors` sync (OpenStates).
   - Build the map with a per-state side panel (current representation).
   - Build state and legislator/governor pages.
   - Implement `races_2026` (even with semi-manual data initially) and the `/midterms-2026` page.
3. **Phase 2 — Geography:**
   - Sync `cities`, `states` (population, capitals) via Census/Wikidata.
   - Sync `sports_teams` via TheSportsDB.
   - Add a "Geography" tab to state pages.
4. **Phase 3 — Active learning:**
   - Build `/quiz` reusing existing data.

---

## 8. Open Decisions (to validate during implementation)

- Definitive source for `races_2026` (structured Wikipedia vs. Ballotpedia vs. semi-manual entry for the MVP).
- Whether/when to introduce user authentication (e.g., for saving quiz progress) — not included in the MVP.
- Final choice between MapLibre GL JS and Mapbox GL JS (recommendation: MapLibre, to avoid dependency on Mapbox API keys/costs).
- Level of detail for Congress history to show in the MVP (e.g., limit to a certain starting year, or include the full record back to 1789).
