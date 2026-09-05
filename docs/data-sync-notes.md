# Data Sync Notes

Full per-script design history, sourcing research, and every real gotcha caught while
building/running each `scripts/sync/*.mjs` script — referenced from `CLAUDE.md`'s Data
conventions section, not duplicated there. Read the relevant entry before re-running or
modifying a sync script; don't re-derive research already documented here.

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
- **`governors.mjs`** — full source research in plan §3, don't re-derive. Party strings need
  `normalizeParty()` (OpenStates' `"Democratic"` → our `"Democrat"`) or Democrat governors render
  `(?)` badges. OpenStates' rate limit is stricter than documented — sustained 429s can take
  minutes to clear, and 502/503/504 need the same retry treatment as 429 (a real run once lost
  all 50 states' progress to a single unretried PA 502, since nothing writes to Supabase until
  the whole loop finishes). OpenStates genuinely lacks a Governor entry for several states
  despite one existing (CA, NJ, VA, others) — logged as a gap, not hand-patched (a hardcoded
  `GOVERNOR_OVERRIDES` map was tried and removed once it went stale on a real officeholder
  change); `getGovernor()` falls back to `governor_terms` instead. Syncs via `upsert`, not
  delete-then-reinsert — `governor_terms.governor_id`'s FK onto `governors.id` makes a
  full-table delete throw once any state has a linked governor (true after the first
  `governor-history.mjs` run); the FK is `on delete set null` so a single departed/gap-state
  governor's row can still be deleted explicitly.
- **`governor-history.mjs`** — full source research (a real Wikidata SPARQL spike) is in the
  script's own header comment, don't re-derive it. Shaped like `race_candidates` (plain
  `name`/`party`, no required FK) since historical governors predate OpenStates and have no
  natural key; `governor_id` is nullable, set only on a state's current term. Three gotchas: a
  person's party (P102) statements aren't date-scoped to the term being synced, so a
  party-switcher shows up against every term unless resolved client-side by matching P580/P582
  dates (`resolveParty()`); Wikidata occasionally has a genuine duplicate P39 statement for
  the same person/term, which crashes a same-batch upsert unless de-duped by
  `(state_id, wikidata_person_id, start_date)` first; and `fetchTerms()`'s SPARQL query had no
  instance-of filter, so it returned any entity Wikidata tagged with a "Governor of X" P39
  statement, fictional or not — caught live 2026-08-30 via West Virginia's real governor history
  including "Ray Sullivan," a fictional *West Wing* character whose Wikidata entry lists an
  in-show "Governor of West Virginia (2002–2006)" position (no Wikipedia sitelink either, since
  the character was never a real person to backfill a bio for). Fixed with `?person wdt:P31
  wd:Q5` (instance of: human) — verified live against the real endpoint: still returns all 37
  real WV governors, excludes Ray Sullivan; the one bad row already synced was deleted by hand
  (governor_terms needed no equivalent cleanup mechanism — a one-off, not a recurring problem
  after the query fix). `backfillBios()` fills
  `photo_url`/`bio_summary` from the Wikipedia REST API, not Wikidata's own terser
  description — 100% coverage (2,287/2,287, confirmed live 2026-08-30 after the Ray Sullivan
  fictional-entity fix above removed the one person who was never real to begin with). Filters
  on `bio_summary IS NULL` (not `photo_url`) since ~30 people legitimately have no
  thumbnail but do have a real extract. Powers `/governor/[id]` for historical governors — the
  only source for their photo/bio. Wikipedia's REST API rate-limits under sustained load
  (settled on concurrency 2); a `fetch()` can hang indefinitely with no timeout (fixed via
  `AbortSignal.timeout()`); and Wikidata's SPARQL label service can emit a bare entity id (e.g.
  `"Q651820"`) as the label when a person has no English label at all — `backfillBios()`
  detects and repairs this (`BARE_QID_PATTERN`), self-healing any future occurrence via a
  `name ~ '^Q[0-9]+$'` filter.
- **`legislators.mjs`/`governor-history.mjs` run current/recent-scoped in the weekly
  `politicians-sync.yml`** (`LEGISLATORS_SCOPE=current`, `GOVERNOR_HISTORY_SCOPE=current`,
  `BACKFILL_SCOPE=recent` — current officeholders plus anyone whose term ended within ~4 years)
  rather than full-historical, since a 150-year-old term never changes — same reasoning as
  `RACES_SCOPE=pending` above. Full historical resyncs (`npm run sync:legislators-historical`,
  or `sync:governor-history` with the scope env unset) stay manual-only — these sources are
  crowdsourced and do get rare corrections, so this is "off the weekly cadence," not "frozen
  forever." The `terms` cleanup delete is scoped to only the ids a given run actually touched,
  so a `current`-scoped run can't sweep up and delete historical rows from an earlier
  `historical` run (`governor_terms` needed no equivalent fix — it's pure upsert, no
  delete-based cleanup at all). `legislators.wikipedia_title` is a persisted column, not
  re-derived per run, specifically so `BACKFILL_SCOPE=recent`'s population (which includes
  recently-departed people only present in the historical YAML) can still resolve a title even
  though a `current`-scoped run never fetches that file.
- **`districts` migrated, but geometry lives outside Postgres.** `sync:districts` writes two
  things: lightweight metadata rows (`id` = Census GEOID, `state_id`, `district_number`, no
  geometry) into the `districts` table, and the combined TopoJSON topology (~2.5MB, one blob
  sharing borders between adjacent districts — a 5x reduction from ~13MB as independent
  per-row GeoJSON) to a public Supabase Storage bucket (`district-geometry/topology.json`),
  not a `geojson` column. `src/lib/districts-geo.ts` fetches the Storage blob directly (public
  URL, no auth) rather than querying Postgres for it. **`terms.district_id`/`races_2026.district_id`
  (the FK onto this table) were dropped 2026-08-31**
  (`20260831180000_drop_unused_district_id.sql`) — introduced alongside this metadata-only
  redesign but never actually populated by any sync script (every one wrote `district_number`
  only) and never read by any query (`getCurrentRepsByDistrictKey()`/`StateTabs.tsx`/the map all
  join on `state_id`+`district_number`), so it sat null forever as pure schema debt. Worth
  reintroducing only if `districts` ever needs to model **more than one geometry per
  state+number** — e.g. redistricting-cycle versioning (pre-2022 vs. current lines as separate
  rows sharing a `district_number`), at which point `district_number` alone stops being a
  reliable key and something like `district_id` becomes the only way to pin a historical
  term/race to the exact boundary it ran under. Not planned — `districts` only models current
  (119th Congress) lines today (see the House terms/races entry below).
- **`races_2026.mjs`** — full source research in plan §3, don't re-derive. A "called" race needs
  `after_election` to name an actual parsed candidate, not just be non-empty (some pages use a
  `"TBD"` placeholder pre-results). `cleanWikiText()` strips wiki markup but not raw HTML — check
  for un-stripped HTML first if a candidate name looks malformed. **House races need their own
  fetch path** — one Wikipedia page per STATE (not per race), each district in its own
  `==District N==` section, same `{{Infobox election}}` fields as Senate/Governor so the
  candidate-parsing helpers are shared; only page-fetching (`fetchWikitext(..., { fullPage: true
  })`) and splitting (`splitIntoDistrictSections()`) differ. A single-district state's page has
  no district heading — treated as one race, district 0 (at-large), matching the
  `terms`/`legislators` convention. `parseHouseTitle()`'s regex naturally excludes the
  category's overview and special-election pages, no separate exclusion list needed (506 races
  synced live: 35 Senate, 36 Governor, 435 House). **Syncs insert-then-cleanup, not
  delete-then-insert** — same reorder and reasoning as `governors.mjs`: a fresh race is inserted
  first (stamped with this run's `last_synced_at`); only once the whole set succeeds does
  cleanup remove rows stamped before this run, so a partial failure never leaves the table
  incomplete.
- **Candidate profile pages (`candidates` table, added 2026-08-29)** — every race candidate on
  `/midterms-2026`/`/state/[abbr]` links somewhere: to their existing `/legislator/[id]`/
  `/governor/[id]` page if they're a *current* officeholder (matched fresh every sync directly on
  the disposable `race_candidates` row via `matchOfficeholder()` — **exact full-name match only**,
  no fuzzy fallback, after two looser heuristics each produced a new class of wrong-person match,
  see below), or to a new `/candidate/[id]` page otherwise. Matching checks *any* current
  officeholder, not just ones flagged `is_incumbent` in that race. Deliberately excludes
  historical (non-current) officeholders — a former Rep/Governor running again falls through to
  the Wikipedia-search path like anyone else (full reasoning in
  `docs/superpowers/specs/2026-08-29-candidate-profiles-design.md`). The `candidates` table only
  holds unmatched challengers, since `race_candidates`/`races_2026` are fully rebuilt every
  sync with no stable id to hang a URL or bio off — same problem `legislators`/`terms` already
  solved by splitting person from per-cycle record. `id` is a slug
  (`${state_id}-${normalized-name}`), not a uuid.
  **Bio matching took four iterations to land on exact-match-only, each a real failure, not
  theoretical:** a name+state+office search often ranks the race's own election-overview page
  above the person's biography (fixed by excluding titles matching `/elections?\b/`); even so,
  full-text search still surfaces a totally unrelated article often enough to matter (a real
  audit found 53% of backfilled bios had zero connection to the candidate); a follow-up
  surname+first-initial heuristic fixed those but produced new same-surname collisions on the
  next audit (e.g. "Sidney Crosby" matched to candidate "Peter Crosby"). The final rule requires
  an exact name match (case/punctuation/a trailing disambiguator aside) — legitimate nickname
  variants ("Dave"/"David") no longer auto-resolve, a real cost, in exchange for eliminating
  wrong-person mismatches outright; unresolved candidates need manual lookup, not another
  automated guess. `matchOfficeholder()` (the separate function linking a candidate straight to
  an existing `/legislator`/`/governor` page, see above) had its own surname-fallback copy of the
  same bug, missed in that pass and caught later via 7 user-reported wrong links (all confirmed
  same-surname-different-person) — fixed the same way, exact match only, no surname fallback.
  **One confirmed exception to exact-match-only, added 2026-09-02**: MA-9's Wikipedia race page
  lists the incumbent by his nickname ("Bill Keating"), which `matchOfficeholder()` correctly
  refused to guess against his real name (William Keating) — rather than loosening the match
  (the exact class of change that already produced wrong-person links twice above), a tiny
  human-curated `NICKNAME_ALIASES` map in `races-2026.mjs` holds just this one manually-confirmed
  case. Not a general nickname-resolution heuristic — same "a human decided this, not an
  algorithm" discipline as `wikipedia_verified` — so a future nickname mismatch needs the same
  by-hand confirmation and addition, not an automatic fallback.
  A `RACES_SCOPE=pending` run can't propagate a matching fix to already-decided races (see
  below), so any future matching change needs a manual full-scope resync to actually apply.
  Every accepted bio is still an unconditional best-effort guess — no reliable ID like
  `bioguide_id`/a Wikidata QID exists for a scraped candidate name — so `/candidate/[id]` shows a
  disclaimer whenever a bio is present and not `wikipedia_verified` (see below). Separately,
  `extractCandidates()` strips ANY trailing parenthetical annotation from a scraped name — caught
  from two real cases, a replacement nominee ("Troy Jackson (replacing Graham Platner)") and an
  uncontested-race marker ("Maxwell Frost (Uncontested)"), both Wikipedia infobox conventions
  that `cleanWikiText()` reduces to plain text but doesn't know isn't part of the name; left in,
  either broke matching by making the annotation look like part of the name.
  **PostgREST gotcha, hit twice, in both directions:** any embed between `race_candidates` and
  `races_2026` needs explicit FK disambiguation
  (`race_candidates!race_candidates_race_id_fkey(...)` /
  `races_2026!race_candidates_race_id_fkey(...)`, never the bare table name) — `race_candidates`
  has two FKs touching `races_2026` (`race_id` and the reverse via `winner_candidate_id`), and
  missing this produces a real 500/thrown error, not a silently-wrong result.
- **`RACES_SCOPE=pending` (added 2026-08-29)** — most 2026 primaries are already resolved and
  locked in for the general, so re-fetching every state's Wikipedia page weekly was mostly
  re-confirming unchanged answers (a real `pending`-scoped run only needed to fetch 28/506
  races). `getPendingStateSets()` derives "still pending" from our own already-synced data (a
  placeholder candidate, zero candidates, or no synced race yet) rather than a hand-maintained
  primary-date calendar that would go stale. The cleanup-delete step is scoped per office to
  exactly the states a `pending` run touched (`touchedByOffice`) — same class of fix
  `LEGISLATORS_SCOPE=current` needed for the identical reason: a blanket delete would otherwise
  remove every state this run deliberately skipped. `races-sync.yml`'s weekly cadence sets
  `RACES_SCOPE=pending`; a manual run (env unset, default `"full"`) re-fetches everything — use
  that for the Nov 3 general, when every state needs re-checking regardless of primary status.
- **Candidate bio backfill split the same way legislators' already was** — `BACKFILL_BUDGET_MS`
  (reusing `legislators.mjs`'s exact mechanism) caps `backfillCandidateBios()` so a normal weekly
  `races-sync.yml` run stays short (10 min cap; the backlog took 45+ minutes unbounded on a real
  run), and a new `CANDIDATES_BACKFILL_ONLY` mode (mirrors `LEGISLATORS_BACKFILL_ONLY`) powers a
  dedicated `candidate-bio-backfill.yml` workflow — every 3 hours, not hourly, since the
  population here (~568 unmatched candidates) is far smaller than legislators' ~12,700. Tagged
  with its own `job: "races_candidate_backfill"` slug (not `"races"`), same reasoning
  `legislators_bio_backfill` gets its own slug for.
- **`candidates.last_synced_at` powers `/candidate/[id]`'s own per-row freshness note** (added
  2026-09-03, the first table to get this treatment before the same pattern was extended to
  legislators/governors/governor_terms/sports_teams/college_football_programs/
  college_basketball_programs — see the Data-freshness indicators entry in `docs/ui-notes.md` for
  the full writeup). The column already existed (added earlier, for insert-then-cleanup's cutover
  marker) but wasn't being read for display — the page instead called
  `getJobFreshness(["races", "races_candidate_backfill"])`, the most recent run of either job
  across ALL candidates, not this one specifically. A real gap surfaced fixing this:
  `backfillCandidateBios()`'s update only ever wrote `wikipedia_title`/`bio_summary`/`photo_url`,
  never `last_synced_at`, so a candidate's row stayed stuck at whatever the far-less-frequent
  race-matching sync last stamped it, even right after a fresh bio backfill — fixed by stamping
  `last_synced_at` on that update too.
- **Manual Wikipedia-bio verification (`wikipedia_verified`/`wikipedia_checked_no`/
  `wikipedia_title`, added 2026-08-30)** — even exact-match search can't rule out two different
  real people sharing one exact name (a real case: CA House candidate "Steve Cohen" auto-matched
  to the actual TN Congressman Steve Cohen's Wikipedia page). A full manual audit of all 467
  then-unresolved candidates (user-reviewed CSV, `id,name,state,office,district,wikipedia_url`,
  `wikipedia_url` either a real URL or the literal `"no"`) is the ground truth for which bios are
  actually confirmed correct. All four person tables (`candidates`, `legislators`, `governors`,
  `governor_terms`) carry the same two booleans (default `false`): `wikipedia_verified` (a human
  confirmed this exact bio) and `wikipedia_checked_no` (a human confirmed no Wikipedia article
  exists — distinct from "nobody's checked yet", so `backfillCandidateBios()`'s query excludes
  `wikipedia_checked_no` rows and stops burning search budget re-attempting a search destined to
  fail every single run). Only a human sets either flag — never the automated search/ID-lookup
  backfills. `governors`' current-officeholder values are copied from the matching
  `governor_terms` row by `copyCurrentBiosToGovernors()`, same as `bio_summary`/`photo_url`
  already were. `/candidate/[id]`, `/legislator/[id]`, `/governor/[id]` show a small badge
  (`WikipediaVerifiedBadge`/`WikipediaNoPageBadge`/`WikipediaSourcedBadge` in
  `src/components/WikipediaVerifiedBadge.tsx`) reflecting whichever is true; the verified badge
  links straight to the confirmed article via `wikipediaUrl()` (`src/lib/wikipedia.ts`) using the
  `wikipedia_title` column every person table now has. **Legislators and governors get a third,
  distinct badge** (`WikipediaSourcedBadge`, sky blue) rather than reusing the candidate
  no-badge/verified split, because their automated match is an ID lookup, not a name search — no
  "top hit" guessing step, so none of the wrong-person risk a candidate's exact-match search
  still carries, but still not a human eyeballing the page. Takes a `source` prop for its
  label/tooltip: `"congress-legislators"` (`legislators.mjs`'s bio backfill reads `wikipedia_title`
  straight off the row, populated from `congress-legislators`' own curated
  bioguide→Wikipedia-title YAML mapping) or `"wikidata"` (`governor-history.mjs` reads the
  Wikipedia article straight from Wikidata's own structured sitelink property for that QID,
  `fetchSitelinkTitles()`). No new column needed for either — fully derivable (`bio_summary` set
  and not `wikipedia_verified`) since every legislator/governor bio is backfilled this same
  ID-based way, never a search; **confirmed live at 100% three-bucket coverage** as of
  2026-08-30: legislators 12,712/12,712 sourced, current governors 38/38 sourced (the other 12
  states have no `governors` row at all — the documented OpenStates gap, fully covered via
  `governor_terms` instead, not a miss here), historical governors 2,425/2,425 sourced (the one
  gap — a person with no Wikidata sitelink at all — turned out to be the Ray Sullivan fictional
  entity above, not a real gap; closed once that row was deleted). **Candidates are the one table
  not fully closed**, and an unverified `bio_summary` here can't be safely folded into the
  "sourced" tier the way legislators/governors can — it came from a name search (real
  wrong-person risk, see Steve Cohen above), not an ID lookup, so it needs the same human
  confirmation as a from-scratch match. A full manual review round closed most of this: **as of
  2026-08-30, 237 verified + 396 confirmed-no = 633/643 (98.4%)**, up from 77/389 before. The
  remaining 10 are a deliberate hold, not a gap — every one is a candidate in a state whose 2026
  primary hasn't happened yet (MA/NH/RI), where the field could still change; see
  `pending-primary-states.ts`'s note below. `scripts/sync/export-unreviewed-candidates.mjs`
  exports every candidate still needing review (no bio yet, or has a bio but never confirmed,
  pre-filled with the current guessed URL so review is a quick confirm-or-correct) — and now
  excludes any candidate from a state with a known-pending primary, so these 10 won't resurface
  for review until they're actually reviewable, self-expiring the same way
  `pending-primary-states.ts` does (small hardcoded date map duplicated into this plain-Node
  script, since it can't import the Next app's TS module — keep both in sync if the dates
  change). `scripts/sync/ingest-candidate-csv.mjs` ingests a filled CSV: a real URL sets
  `wikipedia_verified`, the literal `"no"` sets `wikipedia_checked_no`, and anything else (e.g.
  "primaries not yet held") is left untouched rather than crashing as an unparseable URL. Reuses
  `_wikipedia.mjs`'s retry/backoff/concurrency-2 helper — an earlier version fetched all 160 URLs
  in one unthrottled sequential loop and got hard rate-limited partway through a real run (66
  succeeded, 94 failed) before this fix. No manual audit has been run against legislators/
  historical governors themselves (as opposed to their current ID-sourced bios) — not needed,
  since the ID-based match already closes those tables to 100% three-bucket coverage without one.
  Review CSVs live in `manual-review/` (gitignored — a human's working notes and in-progress
  review state, not a project doc, but kept on disk as a local backup trail), one dated file per
  review round rather than overwriting the same file each time.
- **`legislators.mjs`'s `terms` sync got the identical insert-then-cleanup reorder**, for the
  identical reason — chunked delete-then-insert (45k+ rows) left `terms` incomplete on a
  chunk failure partway through. Needed a new `terms.last_synced_at` column first (`terms`,
  unlike `races_2026`, never had one) to have a cutover marker to clean up against.
- **All six sync scripts log a per-run change summary, not just aggregate counts** (added
  2026-08-31) — every script previously reported only "N rows synced"/"backfilled N", which
  couldn't distinguish a genuine change from a no-op resync, or say why an item was skipped
  (a "no Wikipedia match" backfill outcome was previously indistinguishable in the log from
  "not yet attempted" — caught live from a real `candidate-bio-backfill.yml` run whose log gave
  no way to tell what changed without a separate Supabase query). `scripts/sync/_change-log.mjs`
  (`createChangeLog()`) is the shared tracker: each script fetches the relevant existing rows
  before writing (or, for backfill loops, categorizes each outcome as it's processed), calls
  `record(category, label)` per item, and prints `summary()` — a count per category with
  itemized labels capped at 25 so a large population (e.g. ~12,700 legislators) doesn't flood
  the log while the category total stays exact. Bulk-upsert scripts (`states.mjs`,
  `governors.mjs`, `districts.mjs`) diff against a pre-upsert fetch of existing rows to report
  new/updated/unchanged; `governor-history.mjs`'s per-state `governor_terms` upsert and
  `legislators.mjs`'s `terms` insert-then-cleanup do the same via a content-hash comparison
  against what existed before (terms have no natural key to diff by id); `races-2026.mjs` diffs
  each race's status/candidate-list against its pre-sync state the same way. Every
  bio/photo-backfill loop (candidates, legislators, governor-history) now categorizes each
  outcome (backfilled bio+photo / bio only, no Wikipedia match, search/fetch failed, update
  failed) instead of only incrementing a silent counter. Verified live against production data
  post-change: `states.mjs`/`districts.mjs`/`governors.mjs`/`governor-history.mjs`
  (`GOVERNOR_HISTORY_SCOPE=current`) all correctly reported "unchanged" on a clean rerun, and
  `races-2026.mjs`'s `CANDIDATES_BACKFILL_ONLY` path correctly itemized 7 "no wikipedia match"
  candidates by name (MA/RI, pending-primary states) where the old log only said "Backfilled 0".
- **`geography.mjs`/`sports.mjs` (Phase 2, added 2026-08-31; fully rewritten 2026-09-01)** —
  populate `states.population`/`region`/`flag_url`/`capital_city_id` and the `cities`
  (top 10 most populous cities + capital per state) / `sports_teams` tables. **Sourced entirely
  from World Population Review, no Wikidata, no coordinates, no API key.** This is a full rewrite,
  not an incremental patch — the original Wikidata-SPARQL version (city discovery via a
  settlement-class-filtered candidate search) and its later population-freshness patch
  (`population-overlay.mjs`, a second script overlaying WPR data on top) both existed for one day
  before being replaced outright, at the user's explicit request, once the two-source design
  turned out to need real bug-fixing (name collisions, a `\bcounty\b`/`\bborough\b` classification
  trap, an `is_support_row` schema flag) just to compensate for problems a single WPR-only source
  never has in the first place. **If a past commit or your own memory describes a Wikidata-based
  `fetchTopCities`/`resolveStateQids`/`SETTLEMENT_CLASS_PATTERN`/`is_support_row`/
  `population-overlay.mjs` — that entire design is gone; don't resurrect it.**
  - **`geography.mjs`**: for each state, fetches `worldpopulationreview.com/states/<state>` (state
    population, from a readable "has a population of `<span class="font-bold">N</span>`" sentence;
    capital name, from a `Capital:</dt><dd ...><a ...>Name</a>` definition-list entry) and
    `worldpopulationreview.com/us-cities/<state>` (top 10 cities by WPR's own `rank` field — see
    below for why no city-type filtering is needed). Flag URL is a predictable, confirmed-live
    pattern needing no fetch: `worldpopulationreview.com/images/state-flags/w1280/<abbr>.png`
    (works for DC too). Region stays a static `src/data/state-regions.json` lookup (never changes,
    same as before). Both WPR page types embed a clean, already-parsed JSON array
    (`const data = "[...]";` inside a page-local `<script>`, JS-string-escaped —
    `JSON.parse('"' + captured + '"')` undoes the JS-string escaping, leaving raw JSON text a
    second `JSON.parse` turns into the real array) — not brittle HTML-table-cell scraping.
  - **Why no city-type filtering is needed, unlike the old Wikidata pipeline**: WPR's `rank` field
    already ranks by real population regardless of governance form, so Hawaii's Honolulu (a CDP —
    the state has no incorporated municipalities at all) and Alaska's Anchorage (typed
    "Township") land at the top of their states' lists for free, with no settlement-class
    heuristic required. The old pipeline needed several real, live-discovered iterations
    (NECTA regions, fictional entities, civil townships, Alaska's organized boroughs, a
    `\bcounty\b`/"county seat" collision) purely to approximate what `rank` already gives for
    free — using WPR's `type` field the same way was tried and abandoned too (it's inconsistent
    for the exact same governance-form reasons Wikidata's classes were).
  - **DC is a one-off, synthesized directly**: WPR's `/states/district-of-columbia` page has no
    "has a population of" sentence (different prose shape, confirmed live), and
    `/us-cities/district-of-columbia` redirects straight to a single Washington city page rather
    than a ranked list (DC has no sub-cities to rank). Its population is read from that single
    Washington page's own equivalent sentence (`has an? \d{4} population of ...` — anchored to a
    4-digit year specifically, since that page lists TWO such sentences, current estimate first
    and the 2020 Census second; matching the year-qualified form picks the current one).
  - **The one real naming quirk, confirmed live nationwide**: WPR is internally inconsistent about
    Idaho's capital — the state page's "Capital:" link says "Boise", but that same city's row in
    the ranked `us-cities` list is named "Boise City" (its formal legal name). A trailing " City"
    is stripped from both sides when matching the capital against the ranked list
    (`stripCitySuffix()`) — narrow, single-purpose, confirmed to be the ONLY such collision
    nationwide via a full duplicate-name sweep (Minnesota's old "Saint Paul"/"St. Paul" mismatch
    was purely a Wikidata-vs-WPR artifact from the prior design and no longer exists now that both
    the capital name and the ranked list come from the same source and agree).
  - **`cities` is fully delete-then-reinsert per state on every run**, not an upsert-and-diff —
    unlike the old design, nothing needs to survive across runs for a foreign key's sake anymore
    (see the `sports_teams` entry below), so there's no "stale but still needed" row to reconcile,
    no cleanup-pass exceptions, no schema flag. `states.capital_city_id`'s FK into the rows about
    to be deleted is nulled first, then re-linked after the fresh rows are inserted and their real
    ids are known. A state whose WPR fetch fails is left completely untouched (caught live: an
    earlier version cleared `capital_city_id` for every state up front, unconditionally, before
    checking which fetches actually succeeded — fixed to only touch a state once its fetch is
    confirmed successful).
  - **A real bug in the sync's own change-log accuracy, caught and fixed before trusting this
    design**: because `cities` rows are deleted-and-reinserted every run, `capital_city_id` gets a
    brand-new uuid every single time even when the underlying capital city is completely
    unchanged — comparing that raw id made every rerun report all 51 states as "updated", even a
    genuine no-op rerun. Fixed by comparing the capital's NAME instead (resolved from a snapshot of
    `states`/`cities` taken BEFORE this run's own mutations — an even earlier attempt at this fix
    took the snapshot AFTER the FK-clearing step, which had already nulled every `capital_city_id`
    by that point, so the comparison was comparing "after" against "after" and still always
    reported "updated"; caught by rerunning and actually checking the log, not just checking that
    it ran without error). Verified live: a genuine rerun now reports "51 unchanged state."
  - **`sports.mjs`**: unchanged Wikipedia-team-list parsing (see below), but no longer touches
    `cities` at all — `sports_teams.city_name`/`state_id` are plain columns storing the team's
    parsed home city/state directly, not a FK into `cities`. This FK (and the `cities.
    is_support_row` flag, `CITY_NAME_ALIASES`, and a Wikidata `lookupCityFacts()` lookup for a
    team's home city outside its state's top 10) were all removed in the same 2026-09-01 revamp,
    at the user's explicit prompt ("i don't even understand the need to have a city page link") —
    the FK's only actual use was rendering a team's home city as plain text next to its name ("New
    England Patriots (Foxborough)"); no `/city/[id]` page exists or was ever planned, so
    normalizing that relationship through a join (and everything needed to keep a
    Foxborough/Sunrise/NYC-borough-shaped row alive for it without polluting the "most populous
    cities" ranking) was solving a problem plain text already solved. `sports.mjs` has no
    dependency on `sync:geography` having already run.
  - **Schema migration `20260901130000_cities_sports_wpr_revamp.sql`** drops `cities.latitude`/
    `longitude` (confirmed via a full `src/` grep that nothing ever rendered them) and
    `cities.is_support_row` (no longer needed — see above), and replaces `sports_teams.city_id`
    with `city_name text`/`state_id text references states(id)`. **Wiped both tables' existing
    data outright** rather than migrating it — an explicit user decision ("i don't mind dropping
    all values in the database for this cities table, and start over"), since the whole point of
    the revamp was that WPR replaces the old Wikidata-sourced rows, not that they get preserved in
    a new shape. Does NOT use `truncate ... cascade` on `cities` — `states.capital_city_id`
    references it, and a cascading truncate would have wiped `states` too, taking down
    legislators/governors/districts/races with it (every one of those FKs onto `states.id`);
    caught before applying, not after. Uses explicit FK-safe deletes instead (`update states set
    capital_city_id = null` before `delete from cities`).
  - **Full nationwide verification, run against the final live design**: every state's Geography
    tab loaded in a real browser with zero console errors (MA and HI spot-checked with actual
    screenshots — HI in particular confirmed Honolulu correctly ranked #1 despite being a CDP, and
    a state with no synced teams — HI has none — renders "No major-league sports teams synced for
    this state" rather than an empty/broken section). Both `sync:geography` and `sync:sports`
    confirmed idempotent (a rerun against the fully-synced state reports zero changes for every
    city/state/team). (The empty-state copy and the "no synced pro teams" HI case are both
    superseded by the 2026-09-02 work below — HI now has a synced college program, and the message
    itself was reworded once the section stopped being pro-leagues-only.)
  - **`sports.mjs` extended to WNBA and NWSL (2026-09-02)** — both leagues live on the same
    Wikipedia page/table shape as the original five, so each was a one-line `LEAGUES` addition,
    but neither was a pure drop-in once checked against real wikitext (this codebase's own
    "verify live before trusting" habit paid off twice here, not hypothetically):
    the WNBA's table appends a "Future teams" subsection listing four not-yet-playing expansion
    franchises (Houston Comets 2027, Cleveland Sirens 2028, Detroit 2029, Philadelphia 2030) —
    `parseTeamsTable()` had no concept of "not yet playing" and would have scraped these as real
    current teams; fixed with a `break` once a row block matching `/Future teams/i` is hit (a
    general guard, not WNBA-specific, so it's a no-op for every other league's table). NWSL has
    one team (Boston Legacy FC, playing interim seasons in two cities) split across two wikitext
    rows via a rowspan'd Team cell — the second row's only 2 cells already fail the existing
    `cells.length < 3` check, so the team is kept once under its first-listed city rather than
    duplicated or lost; verified live, not just inferred from reading the regex. Also gave
    `sports.mjs` its first real stale-row cleanup: upsert alone never removed a team that
    relocated/renamed/folded off Wikipedia's list (unlike `cities`' full delete-then-reinsert or
    `races_2026`'s `last_synced_at` cutover) — fixed by diffing the pre-upsert snapshot (already
    fetched for the change log) against the fresh key set and deleting whatever's left over, same
    id-diff pattern `governors.mjs` uses for a departed governor. Verified live: 172 total US
    teams across 7 leagues (156 unchanged pro + 14 WNBA + 16 NWSL, both real full rosters), zero
    unexpected skips.
  - **`sports_teams.wikipedia_title` (added 2026-09-02)** — mirrors what
    `college_football_programs`/`college_basketball_programs` already had: `sports.mjs` captures
    each team's wikilink target alongside the display text it already extracts (same
    `extractLinkTarget()` helper). Initially used to link a pro-league team's name straight to its
    Wikipedia article on `/state/[abbr]`, same as the college groups already did — superseded
    later the same day once `/team/[id]` existed (see the logo/bio/individual-page entry below),
    at which point the state page's team names were repointed to link internally instead.
- **`college-football.mjs` (Phase 2 extension, added 2026-09-02)** — NCAA Division I FBS programs
  (School/Nickname/City/State/Conference), from Wikipedia's "List of NCAA Division I FBS football
  programs," a single wikitable (138 schools, confirmed live — exactly the real total), no key.
  Deliberately a **separate `college_football_programs` table**, not a new `sports_teams` league
  value — a college program carries a conference (no equivalent pro-team field) and is
  amateur/institutional, not "major-league" the way `sports_teams`' own UI copy already commits
  to. Parses by **fixed position from the FRONT** of each row (cells 0–5: School, Nickname, City,
  State, Enrollment, Current conference) — the inverse of `sports.mjs`'s from-the-back approach,
  since here the variable-column-count rows (some schools' "Joined FBS"/"First joined FBS" merge
  via `colspan=2`) only vary in TRAILING columns, so a front-anchored slice is unaffected by it.
  The State cell is already a clean 2-letter abbreviation link (e.g. `[[Alabama|AL]]`) — no
  `nameToAbbr`-style lookup/splitting needed, unlike `sports.mjs`'s "City, State" location cells.
  `wikipedia_title` is sourced from the **Nickname cell's link target**
  (e.g. `Alabama_Crimson_Tide_football`), not the School cell's (`University_of_Alabama`) — the
  program's own article is more specific and more useful to link than the general university one.
  **One real bug caught and fixed live, not assumed away**: Hawaii's school name uses a
  `{{okina}}` MediaWiki template for the ʻokina character (U+02BB) — the plain regex parser has no
  template engine and was leaving raw `"Hawai{{okina}}i"` text in the synced row. Fixed with a
  single substitution (`\{\{okina\}\}` → `ʻ`) on the fetched wikitext before parsing, rather than
  a general template resolver, since a full check of all 138 schools confirmed this is the only
  template used anywhere on the page. The stale-row cleanup (same pattern just added to
  `sports.mjs`) caught its own first real trigger from this fix: the malformed row was correctly
  diffed out as "no longer listed" and replaced by the corrected one in the same run. Needed its
  own follow-up migration for `service_role`'s write grant
  (`20260902120100_college_football_programs_service_role_grant.sql`) — the exact same gotcha
  `governor_terms`/`candidates` already hit (the blanket grant in
  `20260826133154_service_role_grants.sql` only covers tables that existed at that point in
  time), caught live via a real "permission denied" error on the first sync attempt, not
  anticipated in advance. UI: merges into the state page's existing "Sports teams" section rather
  than a separate section (see the `/state/[abbr]` entry below) via a new generic
  `CollapsibleGroup` component — the same rotating-chevron interaction `HouseRacesByState.tsx`
  already established, but deliberately WITHOUT its TanStack Query lazy-fetch machinery, since a
  single state's sports data (pro + college) is already small and already fully loaded via props
  — nothing here needed deferring the way House's 435-race listing page did. Every group defaults
  **expanded**, not collapsed — collapsing exists for tidiness/scannability here, not to hide
  overwhelming volume.
- **`college-basketball.mjs` (Phase 2 extension, added shortly after college football)** — NCAA
  Division I men's basketball programs, joined from **two** Wikipedia pages rather than one:
  "List of NCAA Division I men's basketball programs" (School/Nickname/Home arena/Conference/
  Tournament stats, no city/state at all) and "List of NCAA Division I institutions"
  (School/Common name/Nickname/City/State/Type/Subdivision/Primary conference — covers
  basketball-only schools with no football program too, confirmed live for DePaul/Xavier/
  Butler/Marquette/Georgetown). Same separate-table reasoning as `college_football_programs`
  (own migration, own comment) — shares its exact row shape, unified as one `CollegeProgram`
  TypeScript type and one `getCollegeProgramsForState()` query helper in `geography-data.ts`
  rather than duplicating the type twice.
  **The join is keyed on each school's wikilink TARGET, not display text** — the two pages are
  independently maintained and don't always agree (e.g. the basketball page's ASCII
  "University of Hawaii at Manoa" vs. the institutions page's diacritic "University of
  Hawaiʻi at Mānoa"). A direct target match resolves most schools, but not all — the remaining
  misses are resolved through MediaWiki's own `action=query&redirects=1` (confirmed live: it
  canonicalizes the ASCII form straight to the diacritic form, same pageid), bounded to just the
  actual mismatches via a batched (50-per-request) lookup, not one API call per school. **Verified
  live: 365/365 programs resolved, zero true gaps.** Two real bugs caught and fixed along the
  way, not assumed away: the institutions page has **three** separate City/State tables (a main
  "full members" table, a small "reclassifying members" table for schools moving up from D-II,
  and an empty collapsible header-only template artifact) — an earlier version only checked the
  first and silently missed 4 real reclassifying-member schools (Mercyhurst, New Haven, West
  Florida, West Georgia); and the stored `school` name is sourced from the institutions page's
  **Common name** column, not the basketball page's own School cell — that page's editors
  consistently use full institutional names ("University of North Carolina at Charlotte") where
  football's source page uses short common names ("Charlotte"), which needed two of its own
  fixes (a `{{sort|SortKey|Display}}` template wraps some Common name cells and would have been
  fully stripped by a blanket `{{...}}` removal; the common-name lookup needs the identical
  redirect-resolution fallback the city/state lookup already has). `extractLinkText()`/
  `extractLinkTarget()` were pulled out of their duplicated homes in `sports.mjs` and
  `college-football.mjs` into a shared `scripts/sync/_wikilinks.mjs` once this third script
  needed the identical logic. UI: a second `CollapsibleGroup`, "NCAA Basketball (D1)", appended
  after "NCAA Football (FBS)" in the same merged "Sports teams" section — each program's
  nickname rendered bold (`CollegeProgramGroup`, shared by both college groups) to stand out
  from the school name; pro-league teams were deliberately left unbolded (no separate nickname
  field exists for `sports_teams` — the pro-league source table's Team column is one combined
  string, never split into city + mascot the way the college pages are, so a "bold the last
  word" heuristic would visibly mis-bold real multi-word nicknames like the NBA's Trail Blazers
  or MLB's Red Sox/White Sox, and do nothing sensible for MLS/NWSL names that aren't
  city+mascot shaped at all).
- **`logo_url`/`bio_summary` on `sports_teams`/`college_football_programs`/
  `college_basketball_programs` (added 2026-09-02, migrations `20260902150000`/`20260902160000`)**
  — powers the new individual `/team/[id]`/`/college-football/[id]`/`/college-basketball/[id]`
  pages (see `docs/status-history.md`). Both columns are backfilled together by one shared
  `backfillLogoAndBio()` (`scripts/sync/_wikipedia.mjs`), reusing the exact
  `fetchWikipediaSummary()` REST call `legislators.mjs`/`governor-history.mjs` already use for
  people — a team/program's summary thumbnail IS its logo (confirmed live across real samples from
  all 7 pro leagues plus college football/basketball), so this carries none of the
  candidates table's name-search wrong-match risk (a direct lookup against an already-resolved
  title, not a search). The backfill trigger is keyed on `bio_summary`, not `logo_url` — a real
  Wikipedia article's REST extract is present far more reliably than its infobox thumbnail (some
  smaller college basketball programs' articles genuinely have neither), so using `logo_url` as
  the "already handled" signal would either re-fetch a confirmed-logo-less row forever or (worse,
  hit live) leave a row whose `logo_url` was fetched under the pre-`bio_summary` migration
  permanently stuck without ever getting a bio.
  - **Infobox-parsing fallback (`fetchInfoboxLogoUrl`)** — added the same day after a user-reported
    case proved the REST summary thumbnail alone under-counts real logos: Binghamton Bearcats
    men's basketball's real infobox logo is a 1050×197px wordmark, and MediaWiki's PageImages
    heuristic (which powers that thumbnail field) systematically misses this image shape even
    though the file and the infobox reference are both completely real. When the summary has no
    thumbnail but the article resolved (a real `bio_summary`), this fallback parses the article's
    own lead-section wikitext for its infobox's logo parameter directly and resolves that filename
    to a real file URL, bypassing PageImages entirely. The parameter name isn't universal —
    confirmed live it varies by infobox template: `logo` (NFL/MLB/NBA/WNBA/college basketball),
    `image`/`Image` (MLS/NWSL's `{{Infobox football club}}`, college football's
    `{{Infobox college football team}}`), `logo_image` (`{{Infobox NHL team}}`) — matched via a
    single regex trying all three key names. Two real parsing bugs caught and fixed live while
    building this, not assumed away: a value can be `[[File:X.png|200px]]`-wikilinked or carry a
    `File:`/`Image:` prefix (stripped by `cleanInfoboxFilename()`); and Boston College's `logo`
    value has an inline HTML comment trailing the filename
    (`Boston College Eagles wordmark.svg <!-- Please do not remove... -->`, a real Wikipedia
    editorial convention for non-free files) that was originally left unstripped, corrupting the
    lookup and making a real logo look like another "genuinely missing" case until the comment-strip
    fix landed.
  - **The fallback's own error handling had a real bug, caught only after a full production run**:
    a network failure/exhausted-retry from `fetchInfoboxLogoUrl` was originally swallowed via
    `.catch(() => null)`, collapsing "confirmed no logo" and "the fallback attempt itself failed"
    into the same outcome — since the retry trigger only re-attempts a row with no `bio_summary`,
    a row whose bio succeeded but whose logo fallback merely errored once got permanently stuck at
    `logo_url = null`, confirmed live for Maine and Boston College (both have a real, recoverable
    infobox logo). Fixed by letting the error propagate to the function's existing outer catch
    instead, which clears `bio_summary` too — a deliberate trade (an already-fetched bio gets
    re-fetched) in exchange for the row becoming retry-eligible again. The ~50 rows already stuck
    under the old behavior needed a one-time manual `bio_summary` clear (not committed to the
    repo) to re-enter the backfill queue, since the fix only changes behavior for fetches going
    forward, not rows that already "successfully" (per the bug) recorded a bio.
  - **`sports.mjs` hit its own sustained-429 problem independent of the above**, reproduced
    identically across 3 separate manual runs: its very first Wikipedia request (the team-list
    page's section lookup) died to a 429 lasting its full ~45s retry budget every time, regardless
    of how long a gap preceded the run — ruling out "just wait longer between triggers" as the
    fix. `fetchJson`'s (`_wikidata.mjs`) default 5-attempt/`3000ms*attempt` budget wasn't enough to
    ride it out, unlike `fetchWikipediaSummary`'s 8-attempt/`2000ms*attempt` budget (~72s), which
    reliably survived the same kind of pressure later in these same runs. `fetchJson` gained an
    optional `retry` override (defaulting to its exact original behavior for every existing
    caller — `governor-history.mjs` alone calls it roughly 140 times/run, so a global change here
    risked multiplying its worst-case sustained-429 runtime by over an hour) that only
    `sports.mjs`'s two page-fetch calls opt into. Relatedly, `backfillLogoAndBio`'s own per-row
    hard timeout was raised from 30s to a `BACKFILL_HARD_TIMEOUT_MS` constant of 90s (matching
    `legislators.mjs`'s own bio-backfill precedent) once a real run showed 30s was cutting
    `fetchWikipediaSummary`'s ~72s worst-case retry off early — confirmed live via 104/365 college
    basketball programs failing with "hard timeout" specifically in one run, not a genuine data gap.
  - **Stale-row cleanup in all three scripts deleted by name, not by id — a real, separate bug**
    confirmed live: `college-basketball.mjs`'s cleanup silently failed to remove a genuinely stale
    row (the malformed pre-`cleanCommonName`-fix "Bakersfield" name, full of quotes/braces/angle
    brackets from an unstripped nested template — see below) because that name broke PostgREST's
    `in.()` filter syntax, with no error surfaced. All three scripts' own doc comments already
    claimed to use "the same id-diff pattern `governors.mjs` uses," but none of them actually
    selected or deleted by `id` — fixed by adding `id` to each existing-rows query and deleting by
    `id` instead, which sidesteps this whole class of bug regardless of what characters a name
    contains (`sports.mjs`'s per-league grouping, only needed to scope the old name-based filter,
    was removable too).
  - **`cleanCommonName` (`college-basketball.mjs`) only stripped one level of `{{...}}` template
    nesting per pass** — confirmed live via California State University, Bakersfield's
    institutions-page cell: a `{{refn|...}}` footnote wrapping a further-nested `{{cite web}}`
    citation. A single-pass strip regex correctly removes the innermost `{{cite web}}` but never
    re-scans to notice the now-unnested `{{refn}}` wrapper became strippable too, leaving raw
    template markup in the stored `school` name. Fixed by looping the strip until the string stops
    changing, handling arbitrary nesting depth; verified live against both this case and the two
    the function already handled (Albany's single-level footnote, St. John's `{{sort|}}`) with no
    regression.
  - **A handful of genuine "no logo anywhere" gaps got a manual, one-off fix, not a scripted
    one** — Georgia Southern (football) and Purdue Fort Wayne/Morgan State/East Texas A&M/Campbell
    (basketball) confirmed to have no logo via either method after the fixes above, each with a
    real image found by hand (mostly ESPN's team-logo CDN) and set directly in Supabase. Same
    class of manual, unscripted gap-fill as bioguide `G000607`'s hand-patched `wikipedia_title`
    above — `logo_url` set this way is safe from being overwritten by a future sync as long as
    `bio_summary`/`wikipedia_title` stay unchanged for that row, since the backfill only re-fetches
    when `bio_summary` is null.
- **House terms/races join on `district_number` (plain int)** — the map, `getCurrentRepsByDistrictKey()`,
  and every House `StateTabs.tsx` display all key off it; see the `districts` entry above for why
  the once-parallel `district_id` FK column was dropped rather than wired up.
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
  self-updates once a state's real primary results land in the next weekly sync. **Can't catch
  every case, though** — caught live 2026-08-30: MA's Jim McGovern/Ayanna Pressley House races
  each had exactly one real name and nothing else (no TBD, no second candidate), so both text
  patterns missed it and the races displayed as fully decided despite MA not having voted.
  Candidate count/wording alone can't distinguish "genuinely uncontested, already final" (the
  Maxwell Frost pattern, common and legitimate) from "this state just hasn't voted yet" — the
  only reliable signal is knowing which states haven't voted, which is exactly the calendar the
  sync deliberately avoids hardcoding (see `RACES_SCOPE=pending` above). `primaryPendingMessage()`
  (same file) resolves this with a small, explicitly temporary exception instead of a real
  calendar: `src/lib/pending-primary-states.ts` hardcodes just the 4 states with a genuinely
  known-pending 2026 primary (MA Sep 1, NH Sep 8, RI Sep 9, DE Sep 15) and their real dates,
  cross-checked ahead of the text-pattern fallback. Self-expiring by design — each entry's
  cutoff is the day after that state's primary, so the flag disappears on its own once voting
  happens, no follow-up change needed to remove it; delete the file (or a state's entry)
  once all four have passed. Used by both `RaceRow.tsx` (`/midterms-2026`'s Senate/Governor/
  House rows) and `StateTabs.tsx` (`/state/[abbr]`'s Midterms tab), so an affected race shows
  "Primary not yet held (Sep 1, 2026)." instead of a presumed candidate name, on every page that
  renders it. **First real self-expiry, 2026-09-02**: MA's Sep 1 primary happened and results were
  verified correct, so its entry was dropped per the file's own documented convention — exactly 3
  states now remain (NH/RI/DE). `export-unreviewed-candidates.mjs`'s own duplicate cutoff map (see
  the candidates section above) was kept in sync with the removal, same as when entries were added.
