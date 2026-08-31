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
  `sync.yml`** (`LEGISLATORS_SCOPE=current`, `GOVERNOR_HISTORY_SCOPE=current`,
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
  not a `geojson` column. `terms.district_id`/`races_2026.district_id` can now resolve, though
  nothing populates them yet — House terms still join by the separate `district_number` column
  (`getCurrentRepsByDistrictKey()`). `src/lib/districts-geo.ts` fetches the Storage blob
  directly (public URL, no auth) rather than querying Postgres for it.
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
  with its own `job: "races_candidate_backfill"` slug (not `"races"`) so it stays out of
  `src/lib/sync-freshness.ts`'s core-jobs freshness figure, same reasoning
  `legislators_bio_backfill` is already excluded for.
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
- **Not built yet:** geography/sports sync (Phase 2). Source research is in plan §3. **A `cities`/
  `sports_teams` schema already exists** (`cities`: name/state_id/population/is_capital/latitude/
  longitude, FK to `states`; `sports_teams`: name/league/city_id, FK to `cities`; `states` also
  carries a `capital_city_id` FK into `cities`) — real early scaffolding from the very start of the
  project, built directly against the live database rather than through a migration, which is why
  it went undetected until Supabase's Advisors flagged both tables as "RLS enabled, no policy"
  (2026-08-31). Formally adopted into version control via
  `20260831160000_adopt_geography_scaffolding.sql` (idempotent — matches what already existed
  live) with the same public-read policy/grant every other table uses. Both tables are still
  **empty and unused** — nothing syncs into them or reads from them yet, and the actual source
  choice (Census/Wikidata/GeoNames per the Open decisions section) isn't locked in — treat this
  schema as a starting draft to revise, not a settled design, when Phase 2 actually starts.
- **House terms/races carry `district_number` (plain int) separately from `district_id`** (FK
  into `districts` — still unused by anything, on both `terms` and `races_2026`; the map,
  `getCurrentRepsByDistrictKey()`, and every House `StateTabs.tsx` display all join on
  `district_number` instead).
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
  renders it.

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
- **Data-freshness indicators** (`SyncFreshnessNote`/`SyncFreshnessRow`/`GlobalFooter`,
  `src/lib/sync-freshness.ts`): small muted "X synced Y ago" text reading `sync_logs`, which
  every sync script now stamps with a stable `job` slug instead of relying on the free-text
  `source` field (which already varies by scope/mode within the same script). Each item is
  prefixed by a small dot reusing the app's "Live/pending" convention rather than a new one:
  pulsing emerald for synced within the last day (the one tier where "live" is an honest claim),
  static amber for 1-7 days, static neutral gray beyond that — same pulse-means-something
  discipline as `RaceRow`'s not-yet-decided dot elsewhere in the app.
  **Two kinds of note, not shown together:** `/state/[abbr]` shows three separate items via
  `SyncFreshnessRow` — Legislators/Governor/Governor history, each its own dot and timestamp
  (wraps via `flex-wrap` on narrow viewports, no per-breakpoint branching needed) — rather than
  one combined number. An earlier version used a single `getJobFreshness(["legislators",
  "governors", "governor_history"])` call, which takes the MOST RECENT of the three — caught live
  as dishonest in the opposite direction from the global figure's own fix below: it could read
  "synced 1 hour ago" while one of the three jobs was actually days stale, silently hiding it
  behind whichever job happened to run most recently. `/midterms-2026` still shows one item
  (`SyncFreshnessNote`, a thin wrapper over `SyncFreshnessRow` for the single-item case) since
  races is one atomic sync covering Senate/Governor/House together — nothing to split.
  `GlobalFooter` — the "oldest of every core job's latest run" figure, deliberately excluding
  `legislators_bio_backfill` since it runs far more often than the political data underneath it
  and would otherwise permanently read "synced within the hour" — is a **fallback for pages with
  no page-specific note** (`/legislator/[id]`, `/governor/[id]`) only. An earlier version showed
  both the global footer and a page-specific note on the same page; caught live as genuinely
  confusing (a page reading "synced 1 hour ago" at the top and "synced 1 day ago" at the bottom
  look contradictory even though they answer different questions — one page's data vs. the whole
  site's stalest job) and removed the redundant one rather than just re-labeling it. The home map
  (`/`) gets neither — its `h-dvh` fullscreen layout has no room for a footer row without either
  overflowing the viewport or getting clipped.
- **`GlobalHeader` (added 2026-08-31) is a persistent header shown on every route**, rendered
  once in `src/app/layout.tsx` — the long-term IA answer for how politics/geography/quiz phases
  relate: one shared nav bar all three hang an entry off, instead of every page inventing its own
  "back to map" link (which is all that existed before this). Full design in
  `docs/superpowers/specs/2026-08-31-global-search-nav-design.md`. Self-adjusts its own
  positioning via `usePathname()` rather than needing a per-page opt-in: a `fixed`, semi-
  transparent overlay on `/` (the map is a chrome-free `h-dvh` layout that can't afford to shrink
  for a pushed-down header), `sticky`-in-flow with a solid background everywhere else. `UsMap.tsx`'s
  own top-anchored controls (mode toggle, "2026 Midterms" link) are shifted from `top-2`/`top-3` to
  `top-16` to clear the overlay, and `page.tsx`'s desktop state-panel sidebar gets `sm:pt-14` for
  the same reason (mobile stacks the panel below the map already, unaffected). Carries "Midterms
  2026" today plus disabled "Geography"/"Quiz" slots that light up once those phases ship — no
  functional change needed elsewhere when they do.
- **Global search (`SearchOverlay`, added 2026-08-31)** — opened from `GlobalHeader`'s search
  icon, an icon-triggered modal rather than an always-visible inline box (near-zero permanent
  header width, same interaction on mobile/desktop). Matches happen entirely client-side against a
  pre-fetched flat index (`src/lib/search-index.ts`'s `buildSearchIndex()` — legislators,
  governors incl. the OpenStates-gap/historical `governor_terms` fallback `getGovernor()` already
  uses, candidates, and states from the free local `getAllStates()`) via Fuse.js
  (`ignoreLocation: true` — without it, a typo late in a multi-word name like "Fetterrman" scored
  too low to surface "John Fetterman", confirmed live before adding this option), not a per-
  keystroke server query — "John Smith" as one string can't `ilike` split `first_name`/`last_name`
  columns without a SQL function, and the ~15,700-row population is small enough to hold in memory
  for the session instead. The index fetch is lazy (`useQuery`'s `enabled` flips on the search
  button's hover/focus/click, `staleTime: Infinity`) so nobody who never touches search pays the
  payload cost. Departed legislators get a generic "Former member of Congress" subtitle rather than
  their actual last chamber/state — accurate subtitles would need fetching all ~45k `terms` rows
  just for display text, defeating the point of a light index; a deliberate trade-off, not a gap.
  `SearchOverlay` is only mounted while open (`{searchOpen && <SearchOverlay .../>}` in
  `GlobalHeader`, not an `isOpen` prop rendering `null`) so every open gets fresh `useState`
  defaults for free, avoiding a reset-in-effect. Verified live: a current senator, a departed
  legislator, a governor (including an OpenStates-gap state), a candidate, and a state name all
  resolve to the correct page; a typo still surfaces the right result; Esc/click-outside close it;
  arrow keys + Enter navigate with no mouse; both the home overlay and every other page's sticky
  header render correctly on desktop and mobile (393×851) with zero console errors. Each result
  row also shows a small (32px, rounded) photo on the left — `SearchEntry.photoUrl`, carried
  straight through from the same `photo_url` column each profile page already reads, rendered via
  `next/image`'s `unoptimized` (same convention `/legislator/[id]` etc. already use for these
  external URLs — no `remotePatterns` configured, this app never proxies photos through Next's
  image optimizer). States have no photo; a person can legitimately lack one too (see the
  coverage caveats elsewhere in this doc) — either case falls back to a fixed-size placeholder
  circle (a generic person icon) so rows stay aligned rather than being pushed left.

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

**Profile data coverage (name/photo/bio/term history), verified live — a living snapshot, not a
one-time claim; re-check the actual counts before trusting old numbers here:**

| | Name | Photo | Bio | Term history |
|---|---|---|---|---|
| **Governor, current** | ✅ | ✅ 50/50 (100%) | ✅ 50/50 (100%) | ✅ full non-consecutive history |
| **Governor, past** | ✅ | ✅ 2,229/2,287 (97.5%) | ✅ 2,287/2,287 (100%) | ✅ full history |
| **Senator/Rep, current + past (shared pool)** | ✅ (100%, `photo_url` always set to at least a guessed URL) | ⚠️ same guessed-URL/Wikipedia-fallback mechanism as before, not separately measured per current/past | ✅ 12,712/12,712 (100%) as of 2026-08-30 | ✅ full, all chambers |

Governors went from "current bio is a permanent, never-wired-up gap" to fully solved (see the
`governors.mjs`/`governor-history.mjs` gotchas above) — nothing left to do there. Legislator bio
backfill (current + past, Senate + House all share one pool/one job) reached **100% coverage
(12,712/12,712) as of 2026-08-30** (up from 27.9% on 2026-08-29 — converged fast via repeated
manual `legislator-bio-backfill.yml` triggers), so per this doc's own retirement note below, that
dedicated workflow's schedule is now paused (`workflow_dispatch` kept as a manual fallback, same
pattern as `races-sync.yml`'s pause) — the weekly `BACKFILL_SCOPE=recent` pass in `sync.yml` is
sufficient for ongoing maintenance from here. One known permanent gap, not a bug: a legislator
whose `congress-legislators` entry has no `wikipedia`
field at all (confirmed live for bioguide `G000607`, James Gallagher — a real Wikipedia article
exists, `congress-legislators` just never linked it) can't be resolved by the backfill and stays
`bio_summary IS NULL` forever unless fixed by hand or upstream — same class of gap as OpenStates'
missing Governor entries and Wikidata's bare-QID labels elsewhere in this doc.

Base Next.js + Tailwind + TypeScript scaffold in place. Infra checklist (plan §7) mostly done:
GitHub repo pushed and tracked; Supabase project linked via CLI (credentials in gitignored
`.env.local`); schema applied as versioned migrations (`supabase/migrations/`); Vercel project
connected with Vercel Authentication as the deployment gate; Supabase env vars wired to both
Vercel and local `.env.local`. Not Vercel Cron as the plan originally sketched — `governors.mjs`
rate-limits itself to ~70-100+s, tight against Vercel's 300s function timeout, so a plain
GitHub Actions workflow running the existing `npm run sync:*` scripts unchanged was the
lower-risk choice. Three workflows: `sync.yml` (`states`/`legislators`/`governors`/
`governor_terms`, weekly, Monday 06:00 UTC), `races-sync.yml` (`races_2026`, its own cadence so
it can be paused after the last 2026 primaries (Sep 15) and resumed near the Nov 3 general
independently of the other syncs — `RACES_SCOPE=pending` on the normal cadence, see Data
conventions; offset an hour to Monday 07:00 UTC as of 2026-08-30 so it doesn't start at the
exact same moment as `sync.yml`, both of which can hit Wikipedia's REST API), and
`candidate-bio-backfill.yml` (every 3 hours). Needs three repo secrets
(Settings → Secrets and variables → Actions): `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `OPENSTATES_API_KEY`. Each sync step runs independently
(`continue-on-error`, so one external API having a bad day doesn't skip the others), but a
final step re-checks each step's outcome and fails the overall run if any genuinely
errored — `continue-on-error` alone silently reports the whole job as "success" even when a
step fails, caught from a real run where this masked an OpenStates rate-limit failure.
`districts` stays manual-only (redistricting is ~once/decade, per plan §6).

`legislators.mjs`/`governor-history.mjs`'s current/recent scoping and `legislators.wikipedia_title`
are documented in the Data conventions section above, not repeated here.

**`legislators.bio_summary`/`photo_url` had a separate hourly full-population backfill**
(`.github/workflows/legislator-bio-backfill.yml`, `LEGISLATORS_BACKFILL_ONLY=true` +
`BACKFILL_BUDGET_MS`), which drained the ~12,700-person historical backlog the weekly
`BACKFILL_SCOPE=recent` pass doesn't cover — **retired (schedule paused) 2026-08-30** now that
the backlog hit 100% (see the coverage table above); `workflow_dispatch` stays available as a
manual fallback if a future data refresh ever reopens gaps. GitHub's `schedule:` trigger had
proven unreliable for this workflow specifically while it was active (didn't
fire at all for its first several hours live — genuine platform-side flakiness, not a config
bug) — treat manual triggers as the primary mechanism, not a fallback. Triggering back-to-back
is safe: a `concurrency` group queues rather than overlaps runs, and each GitHub Actions run
gets a fresh ephemeral runner, so the rate-limit compounding seen from repeated *local* testing
doesn't apply here. `withHardTimeout` (`_wikipedia.mjs`) combines a real `Promise.race` with an
`AbortSignal` so a timeout is enforced whether or not the wrapped callback actually honors the
signal — both matter; an earlier version had only one or the other and let stuck retries pile
up silently.

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

**Year travel (added 2026-08-31)** — a year dropdown next to the States/Districts toggle
(`ELECTION_YEARS` in `src/lib/election-years.ts`: "Current" + even years 2024 down to 2000)
repaints the map with that year's ACTUAL Senate/House winners instead of today's, using the
already-synced full historical `terms` data — no new sync work needed. Selecting a year Y means
"the Congress elected in Y" (resolved to `asOfDateForYear(Y)` = `"${Y+1}-01-03"`, the day that
Congress convened — matches `terms.start_date`'s own convention), not "whoever held office on
some date within calendar year Y." Worth remembering when reasoning about "today": as of writing
(2026-08-31), "Current" is actually the 119th Congress, elected in **2024** — the 2026 midterms
haven't happened yet (`/midterms-2026` tracks that separately, as upcoming). Clicking a state
also switches `StatePanel`'s senators/reps to that year (`getSenatorsAsOf`/`getRepresentativesAsOf`
in `legislators-data.ts`). **Governor is year-travel aware too** (`getGovernorAsOf` in
`governors-data.ts`, added shortly after the initial Senate/House version once asked "how do we
close this gap") — queried straight from `governor_terms`' full history (no `governors`-table
fallback needed the way `getGovernor()` needs one, since `governor_terms` already covers every
state regardless of OpenStates coverage; confirmed live for VA, an OpenStates-gap state, before
and after this change). Reuses the same `asOfDate` election-years.ts computes for Congress
(`"${year+1}-01-03"`) as an approximation, not a guarantee — gubernatorial inaugurations vary by
state and aren't all on that date the way Congress reliably convenes Jan 3, so a state whose
actual transition falls a few weeks later could show the outgoing governor for that narrow
window; accepted as the same class of documented simplification as this app's other data-quality
gaps, not surfaced as a separate UI disclaimer (unlike the district-boundary one below, which is
a much larger and much more likely-to-matter gap). Picks the latest-starting match defensively
(not `.maybeSingle()`, which would throw) since `governor_terms`' start/end dates have real,
uneven gaps per state (see `governor-history.mjs`'s header comment). House **district shapes never change** with the
year (only current, 119th-Congress geometry exists) — only the occupant/party joined onto them
does; a year before 2022 (when the current lines took effect in most states,
`districtBoundariesReliable()`) shows a disclaimer in the Districts legend rather than silently
implying the boundaries themselves are historically accurate. `senate-split-geo.ts`/
`legislators-data.ts`'s bulk map-query functions are cached per `asOfDate` (`Map`, not a single
promise) so revisiting an already-viewed year doesn't refetch or rebuild the clipped Senate-split
geometry again. **Real bug caught and fixed during this work, not theoretical:** the initial
`asOf` range filter (`start_date <= asOfDate <= end_date`, both inclusive) double-counted anyone
continuously re-elected — confirmed live that a term's `end_date` and the very next term's
`start_date` are the exact same calendar date (Congress terms are back-to-back with no gap), so
an inclusive `end_date >= asOfDate` matched BOTH the old and new term simultaneously at that
boundary on every single asOf query, not a rare edge case — caught via a real duplicate-React-key
console error, fixed by making `end_date` exclusive (`end_date > asOfDate`) in `applyScope()`.
**The selected year is mirrored into the URL** (`?year=2020`, alongside the existing `?state=`),
parsed back via `parseElectionYearParam()` — same reasoning `selectedAbbr` already had this: a
reload or shared link preserves it. Omitted entirely when "current" (the default), so an ordinary
visit still gets a bare `/`; an invalid/stale value falls back to "current" rather than erroring.
Since "Current" and a specific recent year (e.g. "2024") can genuinely show different people for
the same seat if a resignation/special election happened after that Congress first convened (see
above), the year `<select>` carries an explanatory `title` tooltip, and both map-mode legend boxes
show a one-line reminder of this whenever a specific year (not "current") is selected.
**Party control tally in the legend** (e.g. "53R–45D–2I", added right after the initial
year-travel feature) — `tallyPartyLetters()`/`formatPartyControl()` (`party-colors.ts`) tally by
`partyStyle()`'s own letter, the same classification the map's fill color already uses, so this
can't silently drift from what's actually painted; `getSenatePartyTally()`/`getHousePartyTally()`
(`legislators-data.ts`) derive it from the exact same cached `getSenatorsByStateMap`/
`getRepsByDistrictKeyMap` data the map itself paints with — no extra fetch. Sorted leader-first
(confirmed live matches real composition both directions: "53R–45D–2I" currently, "53D–45R–2I" for
2012, when Democrats led). A seat with no synced term row (a vacancy) is simply absent from the
tally rather than counted as anything, so the total can legitimately read a little under 100/435.

**`/state/[abbr]` page** (`src/app/state/[abbr]/page.tsx` + `StateTabs.tsx`): four tabs per
plan §5 — current representation (real, including governor); history (real Senate, House, AND
governor history back to statehood as aligned tables, current officeholder marked with a dot
rather than "(current)" text — see UI conventions; `getHouseHistory()` mirrors
`getSenateHistory()`); geography (mock, cities/sports flagged "Phase 2, not built"); 2026 midterms
(real — Senate, Governor, AND House races for this state, per-candidate party + incumbent flag;
a House race's `Section` title includes its district number/"At-large" since a state can have
dozens of them, sorted by district — see `raceSectionTitle()`/`OFFICE_ORDER` in `StateTabs.tsx`;
a race with an unresolved primary shows a disclaimer instead of raw candidate text —
see `isPrimaryPending()` above).

**`/midterms-2026`** (plan §5): aligned per-office race tables (state | candidates) for Senate
and Governor, linked from the map's top-right corner. House (435 races) gets a Scoreboard card
too plus its own section below, grouped by state and collapsed by default — but **genuinely
lazy, not just visually collapsed**: an initial `<details>`-based version still fetched all 435
races' candidates on every page load (the browser renders collapsed content into the DOM
either way), which measurably slowed the page down, so it was replaced with
`HouseRacesByState.tsx` (client component) — the page itself fetches only a cheap per-state
`{ total, called }` count with **no candidates join** (`getHouseRaceCountsByState()`), and each
state's full race detail (`getHouseRacesForState()`, via `useQuery`, `enabled: isOpen`) is
fetched only the first time a user expands that specific state; collapsing and re-expanding
doesn't re-fetch (TanStack Query's cache). A rotating chevron (not the native `<details>`
marker) reflects each row's own `isOpen` state — an inline SVG (matching `StatePanel.tsx`'s
close-button icon style), not a rotated text glyph: a `›` character's ink isn't centered in its
own em box, so rotating it 90° via CSS left it visibly off-center against the state name next
to it (caught in a real screenshot, not assumed) — an SVG's viewBox has no such asymmetry.
Real, visible tradeoff from going this route: pre-election, Senate/Governor's cards and rows
still show a real "X/N primaries held"
(needs inspecting candidate names for Wikipedia's TBD/presumptive placeholders — see
`isPrimaryPending()`), but House's Scoreboard card and each collapsed state row can only show a
plain race count, since computing "primaries held" needs exactly the per-candidate data this
design deliberately avoids fetching until expansion — `ScoreboardCard`'s `primariesHeld: null`
prop is what switches a card to that plainer count-only display. `RaceRow` (`src/components/`)
is shared by Senate/Governor's server-rendered rows and every House state's client-rendered
expanded rows — same row shape, state link swapped for a district label. Every race resolves the
same day (Nov 3, 2026), so the top cards show a day-countdown + primaries-held count
pre-election rather than a called-count stuck at 0/N for months; they switch to the real
called-count automatically once that date passes (see `getElectionCountdown()`/
`isPrimaryPending()` in
`src/app/midterms-2026/page.tsx`).
`force-dynamic` — no dynamic route params here to make Next treat it as needing per-request
data automatically, so without this it would prerender once at build time and serve stale race
data forever (caught before shipping, not after).

**`/legislator/[id]`** and **`/governor/[id]`** (plan §5): photo, party, term history for one
person — legislator term history from `terms`. `/governor/[id]`'s `id` resolves two different
ways (`loadProfile()`): a current officeholder's `governors.id` (OpenStates, except for the
handful of states OpenStates has no Governor entry for at all — `getGovernor(stateAbbr)` in
governors-data.ts falls back to that state's current-term `governor_terms` row there instead,
using its `wikidata_person_id` as the `Governor.id` — see the `governors.mjs` gotcha above)
first, falling back to treating `id` as a historical governor's `wikidata_person_id` if that
lookup returns nothing — the two id formats never collide, so this fallback is safe, and it's
also exactly what makes the state-page-level fallback above resolve correctly with no route
changes needed. A current officeholder's
`governors.bio_summary`/`photo_url` are themselves always empty at the source (OpenStates never
provides a bio; only ~76% have a photo) — `governor-history.mjs`'s `copyCurrentBiosToGovernors()`
copies both from the matching (already Wikipedia-backfilled) current-term `governor_terms` row
onto `governors` every weekly sync, so the page's read is unchanged (still just `governors`) but
the column is now always populated; confirmed live 50/50 states after first running this. A
historical governor's photo/bio come from `governor_terms` directly (Wikipedia-backfilled, see
above). Term history comes from `getTermsForGovernor()`
(current) or `getTermsForPerson()` (historical), both matched via `wikidata_person_id` so a
non-consecutive past term by the same person also shows, not just one term. `StateTabs.tsx`'s
History tab links every governor row this way too, current or historical — same as Senate
history already does for every senator. `id` is `legislators.id`
(`bioguide_id`) / `governors.id` (OpenStates person id with its `"ocd-person/"` prefix stripped
at sync time — the raw id contains a `/`, which broke the route; caught via a real 404 in
browser verification, not assumed). Linked from senator/rep/governor names across
`StatePanel.tsx`/`StateTabs.tsx`/`RepresentativesList.tsx`.

**`/candidate/[id]`** (added 2026-08-29, see the `candidates` table entry in Data conventions
above): photo, party, office/state, incumbent flag, and a best-effort Wikipedia bio (with a fixed
disclaimer) for a 2026 race candidate with no existing `/legislator`/`/governor` profile. `id`
is a stable slug computed at sync time, not a uuid — survives `race_candidates`' weekly
delete-and-reinsert churn. `RaceRow.tsx`'s `candidateHref()` decides per candidate: a matched
current officeholder's name links straight to their existing profile (no duplicate content);
everyone else links here.

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
- `governor_terms` — full governor history back to statehood, from Wikidata (2,425 rows across
  50 states, no key), plus photo/bio for 2,287/2,287 distinct people (100%) from the
  Wikipedia REST API. See the Data conventions gotchas above before re-running or modifying
  this one.
- `races_2026`/`race_candidates` — Senate, Governor, AND House races, from Wikipedia (506
  races: 35 Senate, 36 Governor, 435 House — confirmed live, 435 exactly matches the real total
  House seat count, no key). See the Data conventions gotchas above before re-running or
  modifying this one — House in particular needs its own gotcha entry, see there.
- `candidates` — challenger candidates with no existing legislator/governor profile, matched and
  upserted as part of the same `races_2026` sync, bio/photo backfilled via best-effort Wikipedia
  search. See the Data conventions entry above.
- `districts` (metadata table) + `district-geometry/topology.json` (Storage blob) — current
  (119th Congress) House boundaries from the Census Bureau, 436 districts. See the Data
  conventions note above on why geometry isn't a table column.
- `fips-to-abbr.json` — static FIPS↔abbreviation table, shared by multiple scripts and
  `src/lib/state-fips.ts`.

Not started: geography/sports sync, quiz (Phase 3).
