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
- **Periodic data sync:** a weekly GitHub Actions scheduled workflow (`.github/workflows/politicians-sync.yml`), not Supabase `pg_cron`/Vercel Cron Jobs as originally sketched here — `governors`/`races_2026` deliberately rate-limit themselves against external APIs (~70-100+s per run), which was tight against Vercel's function timeout and would've required restructuring each script into an HTTP handler; a plain scheduled workflow runs the existing `npm run sync:*` CLI scripts unchanged. `districts` stays manual-only (§6).
- **Frontend data fetching/caching:** TanStack Query (React Query)
- **Styling:** Tailwind CSS
- **PWA:** manifest.json + icon, "Add to Home Screen" (no native app)

### Data strategy: sync + manual refresh (not static, not "live")

No hardcoded data in the codebase.
1. **Sync jobs** pull from official external sources and write into Supabase, at a frequency **differentiated per table** (§6) — most political/geographic facts change rarely; only `races_2026` is time-sensitive.
2. A **manual refresh** (today: `npm run sync:<name>`) can force a pull any time, and is the only mechanism for tables without automatic sync.
3. The production app **always reads from Supabase**, never calls external APIs directly from the browser.

**Current implementation state** (see `CLAUDE.md` Status for the up-to-date picture): `states`, `legislators`/`terms`, `governors`, `races_2026`/`race_candidates`, `districts`, `cities`, `sports_teams`, `college_football_programs`, and `college_basketball_programs` sync scripts all write directly to Supabase — though `districts`' actual geometry lives in a Supabase Storage bucket rather than a table column (§7 step 10 explains why).

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
- **Known gap, bigger than initially assumed:** 12 states (not just California) return no `"Governor"` entry despite one existing — a real crowdsourced-data completeness gap, verified via raw API responses, not a bug in the query. `governors.mjs` logs missing states to `sync_logs` rather than failing. Originally backed by a hand-maintained `GOVERNOR_OVERRIDES` list (name/party) — **removed**, once it became clear that data goes stale the moment one of those governors leaves office (confirmed live: NJ and VA both changed governors in Jan 2026, silently, since nothing updated the hardcoded literals). `getGovernor()` in `governors-data.ts` now falls back to `governor_terms`' current-term row instead — already synced from Wikidata for every state regardless of OpenStates coverage, so no hardcoding needed at all. DC is separately excluded (has a Mayor, not a Governor — zero results, not a gap).
- **Party strings need normalizing.** OpenStates returns `"Democratic"` (and Minnesota's official `"Democratic-Farmer-Labor"`) — the app's convention, already used by `terms.party` from `congress-legislators`, is `"Democrat"`. Mismatched strings silently render as "no party data" in the UI rather than erroring, so this is easy to ship unnoticed — `governors.mjs`'s `normalizeParty()` handles it.
- **Rate limiting is stricter in practice than "~10 req/sec" suggests** — repeated full-table sync runs in a short window triggered sustained 429s that took several minutes to clear, not seconds. `governors.mjs` paces at 1 req/sec with retry-and-backoff.
- **No term dates or bio in the v3 API** — `governors.start_date`/`end_date`/`bio_summary` stay null forever at the source; not a gap in practice, though. **Resolved via Wikidata, not by OpenStates ever providing it:** `governor-history.mjs`'s `copyCurrentBiosToGovernors()` copies `bio_summary`/`photo_url` from the matching (already Wikipedia-backfilled) `governor_terms` current-term row onto `governors` every weekly sync (confirmed live, 50/50 states). Term dates never actually needed the same treatment — every date shown in the UI (term history tables, `/governor/[id]`) already reads from `governor_terms` directly, not from `governors.start_date`/`end_date`, so those two columns are simply unused dead columns, not a user-facing gap.
- **Governor history (`governor_terms`) — resolved via Wikidata**, not OpenStates (no history endpoint there at all). Each state's "Governor of `<state>`" position item's P39 ("position held") statements, one per term, back to statehood — verified live via real SPARQL queries (Texas, Wyoming, Mississippi) before writing `governor-history.mjs`, not assumed to exist. Two gotchas confirmed real, not theoretical: a person's party (P102) isn't date-scoped to the specific term, so party-switchers need client-side date-overlap matching against the term being synced rather than a naive SPARQL join; and start/end date coverage is real but uneven across states (Mississippi ~27% of rows missing a start date vs. Wyoming's 0%). Full gotcha list is in the script's own header comment.

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
- **Wiki markup isn't the only markup that shows up in a field value — raw HTML does too.**
  Some "presumptive nominee" pages embed a literal `<br />` inside a `nominee`/`candidate`
  field (e.g. Massachusetts governor: `[[Maura Healey]]<br />''(presumptive)''`) — a leaked
  `<br />` showed up in the `/midterms-2026` UI before the parser's text-cleaning step added a
  generic `<[^>]+>` strip alongside its wikilink/template handling.
- **Senate (~35 races) + Governors (~36 races) only** (71 total, confirmed once built). House's 435 races are excluded from automated sync — mostly safe seats with little educational value, and per-district current-representation already covers House at the level this app cares about. If House previews are wanted later, hand-curate just the competitive races Wikipedia's own overview page already highlights.
- Google Civic Information API considered — limited result coverage, not adopted.

### Map boundaries
- **Census Bureau cartographic boundary files** (current Congress, e.g. 119th) — official, no key, pre-generalized for web use (smaller/faster than full TIGER/Line detail). In use via `sync:districts`.
- `unitedstates/districts` (GitHub) — **stale**, last full-nationwide set is from 2016 (pre-2020-census redistricting; later folders are single-state off-cycle updates only). Don't use without re-verifying it's had a genuine full-nationwide update since.

### Geography (Phase 2, shipped 2026-08-31; fully rewritten onto World Population Review 2026-09-01)
- **World Population Review only, no Wikidata, no API key** — state population/capital/flag and each state's top 10 most populous cities all come from `worldpopulationreview.com`'s state and per-state city-ranking pages (a clean embedded JSON blob, not table-cell scraping). Replaces an original Wikidata-SPARQL design (city discovery via settlement-class filtering) and a short-lived WPR-population-overlay-on-top-of-Wikidata intermediate step — both existed for about a day before being fully replaced at the user's request, once it became clear a single WPR-only source doesn't need the several bug fixes (name-collision heuristics, classification traps, a schema flag) the two-source design required just to compensate for Wikidata's staleness. Full writeup, including why WPR's own `rank` field needs no city-type filtering (unlike Wikidata's classes), is in `CLAUDE.md`'s Data conventions section — don't re-derive here.

### Sports (Phase 2, shipped 2026-08-31; extended to WNBA/NWSL and college football/basketball, then logos/bios/individual pages, all 2026-09-02)
- **Not TheSportsDB** — its free key turned out to hard-cap every league's team list at 10 results (confirmed live), unusable for full rosters. Sourced instead by parsing Wikipedia's own "List of professional sports teams in the United States and Canada" article. Full parsing detail and a real row-format edge case (the NHL's Seattle Kraken/Vancouver Canucks rows) are in `CLAUDE.md`'s Data conventions section.
- **WNBA and NWSL added on top of the original NFL/NBA/MLB/NHL/MLS five** — same page, same table shape, but each needed its own real fix once checked against live wikitext rather than assumed safe from the shape alone: the WNBA's table lists 4 not-yet-playing expansion franchises under a "Future teams" heading (needed an explicit stop-parsing guard), and NWSL has one team split across two rows via rowspan for a mid-season venue move (already handled correctly by the existing minimum-cell-count check). `sports_teams` also got its first real stale-row cleanup in the same pass — full detail in `CLAUDE.md`'s Data conventions section.
- **College football (NCAA Division I FBS) is a separate table (`college_football_programs`), not a `sports_teams` league value** — a college program carries a conference (no pro-team equivalent) and is amateur/institutional, not "major-league" the way `sports_teams` itself is framed. Sourced from Wikipedia's "List of NCAA Division I FBS football programs" (138 schools, one wikitable). Full writeup — including the fixed-position-from-the-front parsing strategy (the inverse of the pro-league parser's from-the-back approach) and a real `{{okina}}` template bug caught live on Hawaii's row — is in `CLAUDE.md`'s Data conventions section.
- **College basketball (NCAA Division I men's) needed a two-page join, unlike football** — its source page has no city/state column at all, so `college-basketball.mjs` joins it against a second page ("List of NCAA Division I institutions") keyed by wikilink target, with MediaWiki's own redirect-resolution API as a fallback for the schools whose target doesn't match directly across the two independently-maintained pages. Verified live: 365/365 programs resolved. Shares `college_football_programs`' exact row shape (own table, `college_basketball_programs`) — full writeup, including two real bugs caught while building it (a missed second "reclassifying members" table on the institutions page, and a `{{sort|}}` template mishandled while sourcing the short common name used for display), is in `CLAUDE.md`'s Data conventions section.
- **Logos and bios, plus individual `/team/[id]`/`/college-football/[id]`/`/college-basketball/[id]` pages, added 2026-09-02** — `logo_url`/`bio_summary` on all three tables above, backfilled from the same Wikipedia REST endpoint `legislators.mjs`/`governor-history.mjs` already use for people, plus a new infobox-wikitext-parsing fallback for when that endpoint's own thumbnail heuristic misses a real logo (confirmed live for several wordmark-shaped college logos). Needed several real reliability fixes along the way — a malformed school name from an under-stripped nested template, a stale-row-cleanup bug (deleting by name instead of by id), a fallback error-swallowing bug, and two rounds of retry-budget tuning against real sustained Wikipedia rate-limiting. Full writeup, including every bug and its fix, is in `CLAUDE.md`'s Data conventions section — don't re-derive here. A handful of programs confirmed to have no logo anywhere Wikipedia exposes one got a manual, one-off fix instead of a scripted one (also documented there).

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
- `id` (PK, `bioguide_id`) · `bioguide_id` · `govtrack_id` · `first_name`, `last_name` ·
  `photo_url` (guessed `unitedstates/images` URL at sync time; ~97.6% actually resolves,
  confirmed live by checking all 532 current senators/reps individually — the rest are almost
  always very recently-seated members not yet in that community-maintained image set) ·
  `birthday` · `bio_summary` (was permanently null — no source ever wired up. Backfilled from
  Wikipedia; reached 100% coverage (12,712/12,712) as of 2026-08-30, converging via a dedicated
  GitHub Actions schedule that has since been retired — see §6. Same mechanism also fixes a
  broken `photo_url` by falling back to a Wikipedia thumbnail, once that person's bio backfill
  runs) · `wikipedia_title` (the article title itself, read directly from
  `congress-legislators`' own curated bioguide→Wikipedia mapping — never guessed or searched;
  persisted so a `BACKFILL_SCOPE=recent` run can still resolve a title for someone only present
  in the historical YAML) · `wikipedia_verified`/`wikipedia_checked_no` (both booleans, default
  `false` — reserved for a future manual audit like the one already run against `candidates`
  (§4's `candidates` entry below); every legislator bio today is ID-sourced, not yet
  human-verified, see CLAUDE.md's verification-badge note) · `last_synced_at` (added 2026-09-03 —
  powers `/legislator/[id]`'s own per-row freshness note; stamped by every write path
  (upsert + bio-backfill update), see CLAUDE.md's Data-freshness indicators entry).

### `terms`
A legislator's term — full historical record without duplicating `legislators`.
- `id` (PK) · `legislator_id` (FK) · `chamber` (`house`|`senate`) · `state_id` (FK) ·
  `district_number` (plain int, nullable — House only; `getCurrentRepsByDistrictKey()` joins on
  this) · `party` (nullable — some historical terms predate parties) ·
  `start_date` · `end_date` (nullable if current) · `is_current` (bool) · `last_synced_at`
  (the cutover marker `legislators.mjs` cleans up against — full resync inserts the fresh
  set first, only removing the previous run's rows once every new row succeeds, rather than
  deleting first; a chunk failing partway through used to leave this table genuinely
  incomplete, not just stale).

### `districts`
- `id` (PK, text — the Census GEOID, e.g. `"4801"` for Texas's 1st district; same natural-key
  pattern as `legislators.id`/`bioguide_id`) · `state_id` (FK) · `district_number`. **No
  `geojson` column** — geometry lives as a single combined TopoJSON blob in a public Supabase
  Storage bucket (`district-geometry/topology.json`), not per-row (§7 step 10 explains why).

### `governors`
- `id` (PK, text — OpenStates' own person id with its `"ocd-person/"` prefix stripped, e.g.
  `d73f10ee-...`, same natural-key pattern as `legislators.id`/`bioguide_id`; the prefix is
  stripped because it contains a `/`, which broke the `/governor/[id]` route — caught via a
  real 404 in browser verification) · `first_name`, `last_name`, `photo_url` (from OpenStates —
  §3; no manual override anymore, see §3) · `bio_summary` (not available from OpenStates itself,
  but populated anyway — copied from `governor_terms` by `governor-history.mjs`, see §3) ·
  `state_id` (FK) · `party` (from OpenStates, normalized to `"Democrat"`/`"Republican"` — §3) ·
  `start_date`, `end_date` (not available from OpenStates — stay null forever; not a user-facing
  gap, since the UI never reads dates from here — see §3) · `wikipedia_title`/
  `wikipedia_verified`/`wikipedia_checked_no` (same shape/meaning as `legislators`' own columns
  above — copied from the matching `governor_terms` current-term row alongside `bio_summary`/
  `photo_url`, not sourced independently) · `last_synced_at` (added 2026-09-03, same purpose as
  `legislators`' own — stamped both by `governors.mjs`'s upsert and by
  `copyCurrentBiosToGovernors()`'s update, since that's the only place a current officeholder's
  bio/photo is actually written). No history — one row per state,
  current officeholder only, and only for the states OpenStates actually covers (§3's 12-state
  gap has no row here at all, `getGovernor()` falls back to `governor_terms` instead); **upserted**
  each sync, not full-replaced — `governor_terms.governor_id`'s FK onto this table's `id` (added
  after this table's original design) means a blind delete-then-reinsert throws once any state
  has a linked `governor_id`, which is always true after the first `governor-history.mjs` run.

### `governor_terms`
Full governor history per state, back to statehood, from Wikidata (§3) — added after the MVP
schema draft above, since OpenStates has no history endpoint. Shaped like `race_candidates`
(plain `name`/`party`, no required FK to a person table) rather than `terms` — historical
governors predate OpenStates entirely and have no `legislators.id`-style natural key.
- `id` (PK) · `state_id` (FK) · `governor_id` (FK → `governors.id` **on delete set null**,
  nullable — set only on a state's current term row, the only one with a real `governors.id` to
  link; the plain default-RESTRICT FK this started as blocked `governors.mjs` from ever
  deleting a still-referenced row, turning "remove a departed/gap-state governor" into a
  permanent no-op rather than a one-off transient conflict — see §3) ·
  `wikidata_person_id` · `name` · `party` (nullable — a real, if uncommon, Wikidata gap for
  early-19th-century figures) · `start_date`, `end_date` (both nullable — real Wikidata gaps,
  verified to vary a lot by state, e.g. Mississippi ~27% of rows missing a start date) ·
  `is_current` · `photo_url`, `bio_summary` (both nullable, from the Wikipedia REST API, not
  Wikidata's own P18/description — added after the initial history sync, once photo/bio
  feasibility for historical governors' own `/governor/[id]` profile pages was confirmed live
  at 97-100% coverage across three sampled states, then built at full scale: 2,287/2,287
  people, 100% — the one apparent gap here turned out to be "Ray Sullivan," a fictional West
  Wing character Wikidata's SPARQL query returned alongside real West Virginia governors before
  `fetchTerms()` added an instance-of-human filter; deleted once identified, not a real data
  gap) · `wikipedia_title` (the enwiki article title, read directly from Wikidata's
  own structured sitelink property for that person's QID — never guessed or searched) ·
  `wikipedia_verified`/`wikipedia_checked_no` (both booleans, default `false` — same shape as
  `legislators`'; every historical governor bio today is ID-sourced via that sitelink, not yet
  human-verified) · `last_synced_at` (added 2026-09-03 — powers `/governor/[id]`'s per-row
  freshness note for a historical governor; a genuinely non-current term row only advances on an
  occasional full manual resync, `GOVERNOR_HISTORY_SCOPE=current`'s weekly cadence only touches
  each state's current term).

### `races_2026`
Senate + Governor + House (§3) — House added after the MVP once its different Wikipedia page
structure (one page per state, not per race) was scoped.
- `id` (PK) · `office` (`house`|`senate`|`governor`) · `state_id` (FK) · `district_number` (plain
  int, nullable — House-only, same convention as `terms.district_number`) · `candidates` — a related
  table `race_candidates` (`race_id` FK, `name`, `party`, `is_incumbent`, plus `candidate_id`/
  `matched_legislator_id`/`matched_governor_id` — see below), not a JSON array, so a winner can
  reference a real row · `status` (`open`|`called`) · `winner_candidate_id`
  (FK → `race_candidates`, nullable) · `last_synced_at` (also the cutover marker
  `races-2026.mjs` cleans up against — see `terms.last_synced_at`'s note above for why)

`race_candidates` is fully deleted and re-inserted every sync (no natural key to upsert
against), so it can only ever describe *this cycle's* candidate — `candidate_id`/
`matched_legislator_id`/`matched_governor_id` (added 2026-08-29, one always null) point at
whichever of `candidates`/`legislators`/`governors` actually owns this person's stable profile
page, recomputed fresh every sync directly on the disposable row (`matchOfficeholder()` in
`races-2026.mjs` — exact full-name match only against current officeholders, no fuzzy
fallback, after two looser heuristics each produced a real wrong-person match in production;
full failure history in CLAUDE.md's candidate-profiles note).

### `candidates`
A 2026 race candidate with no existing `legislators`/`governors` profile (a challenger, not a
current officeholder) — added 2026-08-29, split from `race_candidates` for the identical reason
`legislators`/`terms` and `governors`/`governor_terms` already split person from per-cycle
record: `race_candidates` has no stable id to hang a URL or bio off, since it's fully rebuilt
every sync.
- `id` (PK, text — slug `${state_id}-${normalized-name}`, e.g. `"ca-john-smith"`, not a uuid, so
  it survives the weekly delete-and-reinsert of `race_candidates`) · `name` · `state_id` (FK) ·
  `bio_summary`, `photo_url` (both nullable, best-effort from a Wikipedia name search — no
  reliable ID like `bioguide_id`/a Wikidata QID exists for a scraped candidate name, so
  `/candidate/[id]` always shows a disclaimer unless `wikipedia_verified`) · `wikipedia_title`
  (the matched article title, used to reconstruct a link) · `wikipedia_verified`/
  `wikipedia_checked_no` (both booleans, default `false` — the ground truth from a full manual
  audit: a human either confirmed the exact bio against the real page, or confirmed no
  Wikipedia article exists for this person at all; only a human sets either flag, never the
  automated search backfill) · `last_synced_at`.

This table has **no delete/cleanup step** — unlike `race_candidates`/`races_2026`, a correction
to the scraper (e.g. a name-extraction fix) produces a new, differently-keyed row rather than
updating an old one in place, which can leave a handful of orphaned rows behind (harmless,
unreferenced, and the `/candidate/[id]` page 404s gracefully if one is ever visited directly —
seen live a few times, cleaned up by hand each time, not worth automating for the volume
involved).

### `cities`
- `id` (PK) · `name` · `state_id` (FK) · `population` · `is_capital` (bool). Holds nothing but each
  state's real top 10 most populous cities + its capital (2026-09-01 revamp: no coordinates — never
  rendered anywhere, confirmed via a full `src/` grep — and no `sports_teams` FK to accommodate, see
  below) — `geography.mjs` deletes and reinserts a state's rows fresh on every run rather than
  diffing/preserving anything across runs.

### `sports_teams`
- `id` (PK) · `name` · `league` (text, no enum constraint — currently NFL/NBA/MLB/NHL/MLS/WNBA/NWSL)
  · `city_name` (text) · `state_id` (FK) · `wikipedia_title` (added 2026-09-02 — the team's own
  article, sourced from the Team cell's link target) · `logo_url`, `bio_summary` (both nullable,
  added 2026-09-02 — backfilled from the same Wikipedia REST call, with an infobox-parsing
  fallback for `logo_url` when the REST thumbnail alone misses a real logo; **100% coverage
  confirmed live, 172/172**) · `last_synced_at` (added 2026-09-03 — powers `/team/[id]`'s per-row
  freshness note; every row shares one timestamp per run today since this table does a full
  upsert every sync, not a partial one). Stores its own home city/state directly rather than
  joining through `cities` (that FK was dropped in the same 2026-09-01 revamp — its only actual use
  was rendering plain text like "New England Patriots (Foxborough)" next to a team's name; no
  `/city/[id]` page exists or was ever planned, so a `cities` join — and everything needed to keep a
  non-top-10 home city's row alive for it without polluting the "most populous cities" ranking —
  was solving a problem plain text already solved).

### `college_football_programs`
- `id` (PK) · `school` (unique) · `nickname` · `city_name` (text) · `state_id` (FK) · `conference`
  · `wikipedia_title` (the program's own article, e.g. `Alabama_Crimson_Tide_football` — sourced
  from the Nickname cell's link target, not the School cell's general-university one) · `logo_url`,
  `bio_summary` (both nullable, added 2026-09-02, same backfill mechanism as `sports_teams` above;
  **100% coverage confirmed live, 138/138** — one genuine no-Wikipedia-logo gap, Georgia Southern,
  closed by hand) · `last_synced_at` (added 2026-09-03, same shape/reasoning as `sports_teams`'
  own). Added 2026-09-02, deliberately separate from `sports_teams` rather than a shared table — see the Sports
  section above and `CLAUDE.md`'s Data conventions for why.

### `college_basketball_programs`
- Identical shape to `college_football_programs` — `id` (PK) · `school` (unique) · `nickname` ·
  `city_name` (text) · `state_id` (FK) · `conference` · `wikipedia_title` · `logo_url`,
  `bio_summary` (both nullable, added 2026-09-02, same backfill mechanism; **100% bio coverage,
  361/365 logo coverage confirmed live** — 4 genuine no-Wikipedia-logo gaps closed by hand) ·
  `last_synced_at` (added 2026-09-03, same shape/reasoning as `sports_teams`' own). A
  separate table, not a
  shared one, even though the row shape is the same — each is a distinct, independently re-synced
  source, not two views of one underlying entity. `school` is sourced from a second Wikipedia page
  (the basketball programs page itself has no city/state at all) — see the Sports section above.

### `sync_logs`
- `id` (PK) · `source` (free-text, varies by scope/mode within the same script — not stable
  enough to query on) · `job` (added 2026-08-29 — a stable slug per script/purpose, e.g.
  `"legislators"`/`"legislators_bio_backfill"`/`"races"`/`"races_candidate_backfill"`, what the
  app's own freshness indicators actually key off, see §6/CLAUDE.md) · `triggered_by`
  (`cron`|`manual`) · `started_at`, `finished_at` · `status` (`success`|`error`) ·
  `error_message` (nullable)

---

## 5. Page Flow / App Structure

### `/` — Home / Interactive Map
- Map of the US (MapLibre), clickable by state. Two modes: "States" (Senate) and "Districts"
  (House) — see `CLAUDE.md`'s UI conventions for why not three modes and how split-party states
  render.
- Clicking either mode selects a state (Districts additionally tracks which district).
- **Not planned:** a dedicated "Geography" map mode. Geography content lives as a tab on `/state/[abbr]` instead (shipped 2026-08-31) — reconsidered and deliberately not added here, since a per-state tab already covers this app's actual use case without a third map mode alongside States/Districts.
- In a political mode: option to highlight states with contested 2026 races.

### `/state/[abbr]` — State Page
Tabs: **Current representation** (senators, reps by district, governor) · **History**
(senators/governors over time) · **Geography** (capital, cities, population, sports) · **2026
Midterms** (races in this state, if any).

### `/legislator/[id]` — Legislator Profile
Photo, bio, current party, term history.

### `/governor/[id]` — Governor Profile
Same shape, adapted to the state executive office.

### `/team/[id]`, `/college-football/[id]`, `/college-basketball/[id]` — Team/Program Profile (added 2026-09-02)
Logo, name (plus nickname/conference for the college pages), home city (linked to `/state/[abbr]`),
and a Wikipedia-sourced bio for one `sports_teams`/`college_football_programs`/
`college_basketball_programs` row. Linked from the state page's Sports teams section.

### `/midterms-2026` — 2026 Midterms Preview
Scoreboard (confirmed vs. contested, by House/Senate/Governors), list/map of featured races.
Must clearly state this **is not a real-time results service**.

### `/quiz`, `/quiz/[category]` — Quiz Mode (Phase 3, shipped 2026-09-03)
Reuses existing tables/query helpers, no new data source or sync script. Five categories, each
its own `/quiz/[category]` page: **Geography** (10 question types as of a 2026-09-04 follow-up —
capital, flag, map-click, name↔abbreviation, city→state, largest-city, is-capital,
is-largest-city, and state/city population comparisons), **Officeholders** (6 question types as
of a 2026-09-04 follow-up — current governor, officeholder-photo-to-state (senators/reps/
governors combined), officeholder party, combined photo+state name-guess, legislator chamber
(Senate vs. House), and House seat count per state), **2026 Midterms** (candidate party,
incumbency), **Sports** (team
logo, team-to-state, plus a matching-pairs mode), **Mashups** (odd-one-out — "which of these
teams is NOT based in the same state as the others?" — plus a 60-second speed round mixing every
other category's multiple-choice question types together). Every question is multiple choice or
map-click; a question type whose real answer space has fewer than 4 distinct values (e.g.
candidate party) asks with fewer options rather than forcing a separate true/false format, and a
two-way comparison question (e.g. "which state has a higher population?") asks with the two
entities themselves as the options rather than going through the usual subject+distractor-pool
shape. Regular rounds are 10 questions with immediate per-question feedback; matching and
speed-round are separate, parallel session types with their own results screen and their own
`localStorage` best-score key (no accounts/auth — see §9's Open Decisions). Full architecture,
all 5 categories, the Geography question-type expansion, and the real bugs caught building all of
it (a Strict-Mode map cleanup bug, a speed-round timer/setState bug, a PostgREST ambiguous-FK bug
on the cities/states embed) are documented in CLAUDE.md's Status section.

---

## 6. Data Sync — Periodic Jobs

Sync frequency is differentiated per table, not blanket — most political/geographic facts
(who holds a seat, a state's capital) change on the order of weeks to years; only
`races_2026` is genuinely time-sensitive as election day approaches, and legislator bio/photo
backfill needed its own much-tighter cadence purely to converge in reasonable time (§3). A
manual refresh remains available for every table regardless of automatic cadence — either
`npm run sync:<name>` locally, or a workflow's own "Run workflow" button on the GitHub Actions
tab.

**Actual frequency, verified against the live workflow files** (not aspirational — this table
previously listed several jobs at a frequency that was never implemented, and omitted two jobs
entirely; corrected below). As of 2026-08-29, `legislators`/`governor_terms` also split into a
**current/recent-scoped weekly pass** vs. a **full-historical manual pass** — rewriting a
150-year-old term or backfilling a bio for someone who left office decades ago on the same
weekly cadence as this year's officeholders was pure waste, not safety (full rationale in
CLAUDE.md's data-conventions section):

| Job | Source | Actual frequency | Populates |
|---|---|---|---|
| Sync states (minimal seed) | `us-atlas` + `fips-to-abbr.json` | Weekly (`politicians-sync.yml`, rides along with the jobs below) | `states` (id/name only — see the geography row below for the rest) |
| Sync legislators (current + recent) | unitedstates/congress-legislators | Weekly (`politicians-sync.yml`, Monday 06:00 UTC), `LEGISLATORS_SCOPE=current` — only `legislators-current.yaml`, skips the ~9MB historical file entirely | `legislators`, `terms` (current officeholders only) |
| Sync legislators (full historical) | unitedstates/congress-legislators | **Manual only** (`npm run sync:legislators-historical`) — congress-legislators is crowdsourced and does get rare corrections to old records, so this stays available on demand, just off the weekly cadence | `legislators`, `terms` (full ~1789-present history) |
| Sync legislator bio/photo backfill (recent) | Wikipedia REST API | Weekly, folded into `politicians-sync.yml`'s current-scope legislators step (`BACKFILL_SCOPE=recent`) — current officeholders + anyone who left within ~4 years | `legislators.bio_summary`/`photo_url` (recent pool only) |
| Sync legislator bio/photo backfill (full population) | Wikipedia REST API | **Retired 2026-08-30** — its own separate workflow (`legislator-bio-backfill.yml`) ran hourly, unscoped, until the full ~12,700-person historical backlog converged to 100%; schedule now paused (`workflow_dispatch` kept as a manual fallback), the weekly recent-scoped pass above is sufficient for ongoing maintenance | `legislators.bio_summary`/`photo_url` (full population) |
| Sync governors | OpenStates API | Weekly (`politicians-sync.yml`) | `governors` |
| Sync governor history (current term) | Wikidata | Weekly (`politicians-sync.yml`, rides along with governors in the same run), `GOVERNOR_HISTORY_SCOPE=current` — only that state's current term row + its bio backfill (`BACKFILL_SCOPE=recent`) get written | `governor_terms` (current term per state) |
| Sync governor history (full statehood-to-now) | Wikidata | **Manual only** (`npm run sync:governor-history` with `GOVERNOR_HISTORY_SCOPE` unset) — same crowdsourced-correction rationale as legislators | `governor_terms` (full history) |
| Sync districts/geometry | Census cartographic boundary files | Manual only (~static, redistricting is ~once/decade) | `districts` |
| Sync geography (state population/capital/flag/region + top-10 cities) | World Population Review | Manual only (`npm run sync:geography`), fully rewritten 2026-09-01 (was Wikidata-based) — city population changes faster than "years to decades," so re-run this more often than `sync:districts` if freshness matters; `cities` is fully delete-then-reinsert per state every run, not diffed | `states` (population/region/flag_url/capital_city_id columns), `cities` |
| Sync sports | Wikipedia (team-list page parsing) | Manual only (`npm run sync:sports`) — no dependency on `sync:geography` having run first as of 2026-09-01 (dropped its `cities` FK, stores city name/state directly) — franchise rosters/relocations change rarely | `sports_teams` (NFL/NBA/MLB/NHL/MLS/WNBA/NWSL as of 2026-09-02) |
| Sync college football | Wikipedia (NCAA FBS programs page) | Manual only (`npm run sync:college-football`) — conference realignment/program changes are rare, and this is a single-page fetch (no per-state loop) | `college_football_programs` |
| Sync college basketball | Wikipedia (NCAA D1 basketball programs page + NCAA D1 institutions page) | Manual only (`npm run sync:college-basketball`) — same rare-change rationale as football, two-page fetch (no per-state loop) plus a batched redirect-resolution call for the handful of schools that don't join directly | `college_basketball_programs` |
| Sync 2026 races (Senate + Governor + House, pending states only) | Wikipedia infobox parsing | Weekly, **its own separate workflow** (`races-sync.yml`, decoupled from `politicians-sync.yml` since 2026-08-29 so this cadence can move independently — e.g. paused after the last 2026 primaries (Sep 15) and resumed near the Nov 3 general; offset an hour to Monday 07:00 UTC as of 2026-08-30, since `politicians-sync.yml`'s own 06:00 UTC run can also hit Wikipedia's REST API and the two shouldn't compound rate-limit pressure by starting at the same moment), `RACES_SCOPE=pending` — only re-fetches states whose primary isn't resolved yet in our own data (confirmed live: 28/506 races needed a real fetch on a real run) | `races_2026`, `race_candidates`, plus matching against current legislators/governors (`matched_legislator_id`/`matched_governor_id`) |
| Sync 2026 races (full sweep, every state) | Wikipedia infobox parsing | **Manual only** (`RACES_SCOPE` unset/`"full"`) — an occasional full resync, and mandatory for the Nov 3 general itself, when every state needs re-checking regardless of primary status | same as above |
| Sync challenger candidate bios (recent backlog) | Wikipedia REST API | Folded into the weekly `races-sync.yml` run, budget-capped (`BACKFILL_BUDGET_MS`, 10 min) so a normal week stays short | `candidates.bio_summary`/`photo_url` |
| Sync challenger candidate bios (full backlog) | Wikipedia REST API | **Every 3 hours** — its own separate workflow (`candidate-bio-backfill.yml`, `CANDIDATES_BACKFILL_ONLY=true`), same weekly-sync/frequent-backfill split legislators already has, tuned to the smaller ~568-candidate population (not legislators' hourly/~12,700) | `candidates.bio_summary`/`photo_url` (full population) |

Each job writes a `sync_logs` row for diagnostics — and, as of 2026-08-29, for the app's own
"data synced X ago" freshness indicators too (`SyncFreshnessNote`/`SyncFreshnessRow`,
`src/lib/sync-freshness.ts`), not just an aspirational future use. As of 2026-09-03 this is a
per-row column (`last_synced_at`, on every table with its own detail page) on individual pages,
not just a per-job figure — see CLAUDE.md's Data-freshness indicators entry for the current design
(per-row vs. per-job, the tiered pulsing-dot convention, and the `job` slug each script stamps).

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
    is a normal metadata-only table (id/state_id/district_number). `terms`/`races_2026` never
    got a working FK onto it (`district_id` sat null and unused, dropped 2026-08-31 — see
    CLAUDE.md's `districts` entry); House data joins on `state_id`+`district_number` instead.
    Cron automation is also done —
    a weekly GitHub Actions workflow (§2), not Vercel Cron/Supabase `pg_cron` as this plan
    originally sketched (§2 explains why). Manual `npm run sync:*` still works too.

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
  Vercel Authentication instead (§7 step 8). Quiz best-scores (shipped 2026-09-03) ended up
  needing no accounts after all — they're plain per-browser `localStorage`, not a Supabase table,
  so this decision still stands unrevisited.
- **Open:** MapLibre vs. Mapbox (recommendation: MapLibre, already in use, no reason to switch).
- **Open:** Congress history depth in the UI — full depth is the data default (matches Senate's
  existing history view); capping is a UI task (collapse/paginate) once House/Governors history
  exists, not a data-scope decision.
