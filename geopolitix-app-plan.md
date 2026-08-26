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
- User login/personal profiles (see §9 — resolved, no app-level auth planned).

### Development priority
1. **Phase 1 (main focus):** Politics — House, Senate, Governors, Congress history, 2026 midterms preview.
2. **Phase 2:** Geography — capitals, cities, population, sports teams.
3. **Phase 3:** Active-learning layer (quizzes) on top of data from both previous phases.

---

## 2. Tech Stack

- **Frontend/Framework:** Next.js (App Router)
- **Database:** Supabase (Postgres)
- **Version control:** GitHub
- **Deployment:** Vercel, auto-deploy on push
- **Interactive map:** MapLibre GL JS (open-source Mapbox GL JS fork — no API key/cost)
- **Map geometries:** GeoJSON/TopoJSON for congressional districts and state boundaries
- **Periodic data sync:** Supabase `pg_cron` / Vercel Cron Jobs (not built yet — sync is manual today)
- **Frontend data fetching/caching:** TanStack Query (React Query)
- **Styling:** Tailwind CSS
- **PWA:** manifest.json + icon, "Add to Home Screen" (no native app)

### Data strategy: sync + manual refresh (not static, not "live")

No hardcoded data in the codebase.
1. **Sync jobs** pull from official external sources and write into Supabase, at a frequency **differentiated per table** (§6) — most political/geographic facts change rarely; only `races_2026` is time-sensitive.
2. A **manual refresh** (today: `npm run sync:<name>`) can force a pull any time, and is the only mechanism for tables without automatic sync.
3. The production app **always reads from Supabase**, never calls external APIs directly from the browser.

**Current implementation state** (see `CLAUDE.md` Status for the up-to-date picture): `states`, `legislators`/`terms`, `governors`, `races_2026`/`race_candidates`, and `districts` sync scripts all write directly to Supabase — though `districts`' actual geometry lives in a Supabase Storage bucket rather than a table column (§7 step 10 explains why). Geography/sports sync aren't built yet; follow the Supabase-writing pattern when building them.

**Derived/joined geometry is a separate concern from syncing.** Anything computed by combining two already-synced datasets — e.g. joining district shapes to current reps' party, or splitting a state's real geometry into per-senator halves — belongs in `src/lib/*-geo.ts`, computed at read time and memoized, not precomputed by a sync script.

---

## 3. Data Sources / APIs

### Congress (House/Senate), current and historical
- **`unitedstates/congress-legislators`** (GitHub, YAML/JSON/CSV) — every member of Congress since 1789, no API key. Primary source, in use via `sync:legislators`.
- congress.gov API (official, key required, 5,000 req/hr) and OpenFEC (campaign finance) — not needed for current scope; congress.gov only relevant if a future feature needs votes/bills/committees.
- ProPublica Congress API no longer issues new keys — not viable.

### Governors and state legislatures
- **OpenStates API v3** (`v3.openstates.org`, now under Plural/SAI360 — the consumer app was discontinued but the API/bulk data remain active). Free, requires an account + API key (`X-API-KEY` header or `?apikey=`); ~10 req/sec, 500 req/day, plenty for a weekly sync.
- No dedicated governors endpoint — use `GET /people?jurisdiction=<id>&org_classification=executive`, filter client-side on `current_role.title === "Governor"`. `/jurisdictions` mixes in ~1800 municipalities — filter to `classification === "state"` first, and use each entry's structured `id` (not a name string) as the `jurisdiction` param.
- **Known gap, bigger than initially assumed:** 11 states (not just California) return no `"Governor"` entry despite one existing — a real crowdsourced-data completeness gap, verified via raw API responses, not a bug in the query. `governors.mjs` logs missing states to `sync_logs` rather than failing, backed by a hand-maintained `GOVERNOR_OVERRIDES` list (name/party sourced via web search against Wikipedia's current-governors list, cross-checked — not guessed from memory, given these are real people's current offices). DC is separately excluded (has a Mayor, not a Governor — zero results, not a gap).
- **Party strings need normalizing.** OpenStates returns `"Democratic"` (and Minnesota's official `"Democratic-Farmer-Labor"`) — the app's convention, already used by `terms.party` from `congress-legislators`, is `"Democrat"`. Mismatched strings silently render as "no party data" in the UI rather than erroring, so this is easy to ship unnoticed — `governors.mjs`'s `normalizeParty()` handles it.
- **Rate limiting is stricter in practice than "~10 req/sec" suggests** — repeated full-table sync runs in a short window triggered sustained 429s that took several minutes to clear, not seconds. `governors.mjs` paces at 1 req/sec with retry-and-backoff.
- **No term dates or bio in the v3 API** — `start_date`/`end_date`/`bio_summary` stay null for the MVP. Wikidata (already planned for Phase 2 geography) is a plausible future backfill source for just these fields.

### 2026 midterm elections (`races_2026`)
- No free live-results API exists (AP's is paid/commercial). Source: the **Wikipedia MediaWiki Action API** (`action=parse&prop=wikitext`, no key), parsing each race's infobox — there's no clean JSON feed. Page lists per chamber come from a Wikipedia category, not hand-typed.
- **The infobox template name assumed in earlier drafts of this plan was wrong** —
  verified live (not guessed) once implementation started: every race page uses the generic
  `{{Infobox election}}`, not a chamber-specific `{{Infobox U.S. Senate election}}`. Candidate
  field names vary *within* a chamber too — some Governors pages use `nominee1`/`nominee2`,
  others `candidate1`/`candidate2` — the parser tries both.
- **No explicit "winner confirmed" field** — inferred from the infobox's `after_election`
  field, but only trusted if it actually names one of the race's real candidates. Some pages
  fill `after_election` with a literal placeholder (`"TBD"`) before results exist rather than
  leaving it blank, which a naive "non-empty = called" check would misread as a real result
  (caught on a real example — Wisconsin's 2026 governor race — before shipping).
- Party names on candidate pages aren't consistently the generic "Democratic Party (United
  States)"/"Republican Party (United States)" — some use a state-affiliate name ("Republican
  Party of Texas", "Texas Democratic Party"). Normalize by substring match
  (`/democrat/i`/`/republican/i`/`/independent/i`), not exact string comparison.
- **Senate (~35 races) + Governors (~36 races) only** (71 total, confirmed once built). House's 435 races are excluded from automated sync — mostly safe seats with little educational value, and per-district current-representation already covers House at the level this app cares about. If House previews are wanted later, hand-curate just the competitive races Wikipedia's own overview page already highlights.
- Google Civic Information API considered — limited result coverage, not adopted.

### Map boundaries
- **Census Bureau cartographic boundary files** (current Congress, e.g. 119th) — official, no key, pre-generalized for web use (smaller/faster than full TIGER/Line detail). In use via `sync:districts`.
- `unitedstates/districts` (GitHub) — **stale**, last full-nationwide set is from 2016 (pre-2020-census redistricting; later folders are single-state off-cycle updates only). Don't use without re-verifying it's had a genuine full-nationwide update since.

### Geography (Phase 2, not started)
- US Census Bureau API (population), Wikidata/Wikipedia REST (capitals, founding dates), GeoNames (city coordinates) — likely Census for population + Wikidata for structured facts + GeoNames as a coordinates fallback, but the exact combination is picked at Phase 2 start (§9).

### Sports (Phase 2, not started)
- TheSportsDB API — free tier, sports teams by city/state/league.

### `unitedstates` GitHub org — other repos worth knowing about
The org (`github.com/unitedstates`) has ~40 repos total; most haven't been touched since
2015–2018 (`districts`, above, is one such stale one) — check "last updated" before relying on
any of them. Two actively-maintained ones are relevant beyond `congress-legislators`:
- **`images`** — public-domain photos of Congress members. Schema already has `photo_url` on
  `legislators`/`governors` but no photo sync exists yet; low-effort next addition.
- **`python-us`** — Python package of state metadata (names, abbreviations, FIPS, capitals).
  Not directly importable (Python, app is Node/TS), but a good source to validate/expand
  `fips-to-abbr.json` or help populate `states` in Phase 2.

Lower-priority, mostly stale ones seen while researching (not needed for current scope, listed
so they don't need re-discovering): `congress` (bills/votes data, relevant only if legislator
profiles ever show voting activity), `congressional-record` (floor speeches), `bill-nicknames`/
`glossary`/`acronym` (quiz trivia material, Phase 3+), `contact-congress` (advocacy tool, not
learning content — doesn't fit this app). The rest of the org (legal citation tools, Inspector
General reports, SCOTUS volumes, etc.) has no connection to this app's scope.

---

## 4. Data Model (Conceptual Schema)

> Table/field names are a draft — adjust during implementation as needed, keep this doc in sync if the model changes meaningfully.

### `states`
- `id` (PK, 2-letter code, e.g. "CA") · `name` · `capital_city_id` (FK → `cities`) · `population` · `flag_url`/color · `region`

### `legislators`
- `id` (PK, `bioguide_id`) · `bioguide_id` · `govtrack_id` · `first_name`, `last_name` · `photo_url` · `birthday` · `bio_summary`

### `terms`
A legislator's term — full historical record without duplicating `legislators`.
- `id` (PK) · `legislator_id` (FK) · `chamber` (`house`|`senate`) · `state_id` (FK) ·
  `district_id` (FK → `districts`, nullable) · `district_number` (plain int, nullable — House
  only; populated independently of `district_id` — nothing populates the FK itself yet, even
  though `districts` now exists; `getCurrentRepsByDistrictKey()` still joins on
  `district_number`) · `party` (nullable — some historical terms predate parties) ·
  `start_date` · `end_date` (nullable if current) · `is_current` (bool)

### `districts`
- `id` (PK, text — the Census GEOID, e.g. `"4801"` for Texas's 1st district; same natural-key
  pattern as `legislators.id`/`bioguide_id`) · `state_id` (FK) · `district_number`. **No
  `geojson` column** — geometry lives as a single combined TopoJSON blob in a public Supabase
  Storage bucket (`district-geometry/topology.json`), not per-row (§7 step 10 explains why).

### `governors`
- `id` (PK, text — OpenStates' own person id, e.g. `ocd-person/...`, same natural-key pattern
  as `legislators.id`/`bioguide_id`) · `first_name`, `last_name`, `photo_url` (from OpenStates,
  or a manual override — §3) · `bio_summary` (not available from OpenStates — null) ·
  `state_id` (FK) · `party` (from OpenStates, normalized to `"Democrat"`/`"Republican"` — §3) ·
  `start_date`, `end_date` (not available from OpenStates — null). No history — one row per
  state, current officeholder only; full-replaced on every sync.

### `races_2026`
Senate + Governors only in the MVP (§3).
- `id` (PK) · `office` (`house`|`senate`|`governor`) · `state_id` (FK) · `district_id` (FK,
  nullable) · `candidates` — a related table `race_candidates` (`race_id` FK, `name`, `party`,
  `is_incumbent`), not a JSON array, so a winner can reference a real row · `status`
  (`open`|`called`) · `winner_candidate_id` (FK → `race_candidates`, nullable) · `last_synced_at`

### `cities`
- `id` (PK) · `name` · `state_id` (FK) · `population` · `is_capital` (bool) · `latitude`, `longitude`

### `sports_teams`
- `id` (PK) · `name` · `league` (enum) · `city_id` (FK)

### `sync_logs`
- `id` (PK) · `source` · `triggered_by` (`cron`|`manual`) · `started_at`, `finished_at` ·
  `status` (`success`|`error`) · `error_message` (nullable)

---

## 5. Page Flow / App Structure

### `/` — Home / Interactive Map
- Map of the US (MapLibre), clickable by state. Two modes: "States" (Senate) and "Districts"
  (House) — see `CLAUDE.md`'s UI conventions for why not three modes and how split-party states
  render.
- Clicking either mode selects a state (Districts additionally tracks which district).
- A future "Geography" mode (Phase 2) will layer capitals/cities/sports onto the same map.
- In a political mode: option to highlight states with contested 2026 races.

### `/state/[state_id]` — State Page
Tabs: **Current representation** (senators, reps by district, governor) · **History**
(senators/governors over time) · **Geography** (capital, cities, population, sports) · **2026
Midterms** (races in this state, if any).

### `/legislator/[legislator_id]` — Legislator Profile
Photo, bio, current party, term history.

### `/governor/[governor_id]` — Governor Profile
Same shape, adapted to the state executive office.

### `/midterms-2026` — 2026 Midterms Preview
Scoreboard (confirmed vs. contested, by House/Senate/Governors), list/map of featured races.
Must clearly state this **is not a real-time results service**.

### `/quiz` — Quiz Mode (Phase 3)
Reuses existing tables, no new data source. E.g. "What is the capital of state X?", "Who is
the senior senator of this state?", "Point to state X", "What NFL team is based in this
city?" Modes: by topic or mixed.

---

## 6. Data Sync — Periodic Jobs

Sync frequency is differentiated per table, not blanket — most political/geographic facts
(who holds a seat, a state's capital) change on the order of weeks to years; only
`races_2026` is genuinely time-sensitive as election day approaches. A manual refresh remains
available for every table regardless of automatic cadence.

| Job | Source | Suggested frequency | Populates |
|---|---|---|---|
| Sync legislators | unitedstates/congress-legislators | Weekly/biweekly | `legislators`, `terms` |
| Sync governors | OpenStates API | Weekly/biweekly | `governors` |
| Sync districts/geometry | Census cartographic boundary files | Manual only (~static) | `districts` |
| Sync geography | Census Bureau API, Wikidata | Monthly | `states`, `cities` |
| Sync sports | TheSportsDB API | Manual only (~static) | `sports_teams` |
| Sync 2026 races (Senate + Governors) | Wikipedia infobox parsing | Weekly, daily near election day | `races_2026` |

Each job writes a `sync_logs` row for diagnostics and UI freshness indicators ("data last updated X days ago").

---

## 7. Infrastructure Setup Checklist

Getting from "JSON stand-in" to the real infrastructure. Current progress is tracked in
`CLAUDE.md`'s Status section — this list is the durable step order, not a live log.

1. ✅ Create the GitHub repository
2. ✅ Create the Supabase project
3. ✅ Work out the OpenStates account/key/endpoint shape (§3)
4. ✅ congress.gov API key — not needed; `congress-legislators` covers current scope
5. ✅ Push local commits to GitHub
6. ✅ Create the Supabase schema as a versioned migration (not the SQL Editor) —
   `supabase/migrations/`, applied via the Supabase CLI (`npx supabase`, not a project dependency)
7. ✅ Create/connect the Vercel project (after GitHub push, so the first deploy has code)
8. ✅ Enable a deployment gate — free **Vercel Authentication**, not Password Protection (that
   needs Vercel Pro/$150mo, not worth it for a personal app with no sensitive data)
9. ✅ Connect Supabase env vars to Vercel + local `.env.local`
10. ✅ Migrate `scripts/sync/*.mjs` JSON stand-ins to real Supabase tables (§2). `states`,
    `legislators`/`terms`, `governors`, `races_2026`/`race_candidates`, and `districts` are all
    live. `districts`' storage-format decision (single TopoJSON blob vs. per-row `geojson`,
    since raw per-district GeoJSON costs ~13MB vs. ~2.5MB for one shared-border topology):
    **resolved as neither literally** — geometry lives in a public Supabase Storage bucket
    (`district-geometry/topology.json`), not a Postgres column at all, while `districts` itself
    is a normal metadata-only table (id/state_id/district_number) so its FKs
    (`terms.district_id`, `races_2026.district_id`) can resolve. Cron automation (vs. today's
    manual `npm run sync:*`) still not done — the one thing left in this step.

---

## 8. Suggested Roadmap

> Current build status is tracked in `CLAUDE.md`, not duplicated here.

1. **Base setup:** initial Supabase schema, Next.js + Tailwind + MapLibre, working Vercel deploy.
2. **Phase 1 — Politics:** `legislators`/`terms` + `governors` sync; map with per-state side
   panel; state/legislator/governor pages; `races_2026` (Senate + Governors) + `/midterms-2026`.
3. **Phase 2 — Geography:** `cities`/`states` (population, capitals) + `sports_teams` sync; a
   "Geography" tab on state pages.
4. **Phase 3 — Active learning:** `/quiz` reusing existing data.

---

## 9. Open Decisions

- ~~`races_2026` source~~ — **resolved**, see §3.
- ~~User authentication~~ — **resolved**: no app-level auth; the deployment itself is gated by
  Vercel Authentication instead (§7 step 8). Revisit only if something worth saving per-user
  (quiz progress) gets built.
- **Open:** MapLibre vs. Mapbox (recommendation: MapLibre, already in use, no reason to switch).
- **Open:** Congress history depth in the UI — full depth is the data default (matches Senate's
  existing history view); capping is a UI task (collapse/paginate) once House/Governors history
  exists, not a data-scope decision.
