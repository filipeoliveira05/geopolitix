# Status History

Full page-by-page and infra build narrative — referenced from `CLAUDE.md`'s Status
section, not duplicated there. Read before touching a specific page/feature listed here for
the full "why it's built this way" reasoning and the real bugs caught building it. Quiz
(Phase 3) has its own file, `docs/quiz-notes.md`.

**Phase 1 (politics) is complete** — every page/table in the original Phase 1 scope is built
and reading live from Supabase; infra (below) is fully automated too. A post-Phase-1 UX polish
pass (mobile responsiveness, map framing, table formatting — see below and `docs/ui-notes.md`) and
a data-completeness pass (governor history, loading/error states) has since shipped on top of
it. A full visual design-system overhaul (typography, color tokens, shared Card/SectionHeading/
BackToMapLink primitives — see `docs/ui-notes.md`'s Design system entry) shipped 2026-08-31, replacing
the original default-Next.js look app-wide; the app's actual pages/data/routing are unchanged by
it. **Phase 2 (geography/sports) is also complete**, shipped 2026-08-31 — see the
`geography.mjs`/`sports.mjs` entry in `docs/data-sync-notes.md` for the full sync writeup and its
several real live-discovered gotchas. A follow-on pass (2026-09-02) added team/program logos and
bios plus individual `/team/[id]`/`/college-football/[id]`/`/college-basketball/[id]` pages on
top of the already-complete Phase 2 tables — see the `logo_url`/`bio_summary` entry in
`docs/data-sync-notes.md` for the full writeup (several real reliability bugs caught and fixed
along the way, not just the feature itself). **Phase 3 (quiz) is also complete**, shipped
2026-09-03 across 5 incremental plans — see `docs/quiz-notes.md` for the full writeup
(architecture, all 5 categories, and the real bugs caught building map-click and speed-round
specifically). This closes out the build order from "What this app is" above — every
originally-planned phase is now shipped.

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
pattern as `races-sync.yml`'s pause) — the weekly `BACKFILL_SCOPE=recent` pass in
`politicians-sync.yml` is sufficient for ongoing maintenance from here. One known gap class, not a bug: a legislator whose
`congress-legislators` entry has no `wikipedia` field at all can't be resolved by the automated
backfill and stays `bio_summary IS NULL`/`wikipedia_title IS NULL` forever unless fixed by hand or
upstream — same class of gap as OpenStates' missing Governor entries and Wikidata's bare-QID
labels elsewhere in this doc. Bioguide `G000607` (James Gallagher) was this gap's one confirmed
live instance; `bio_summary`/`photo_url` had already been populated by some earlier means, so only
`wikipedia_title` was actually null (breaking the "sourced" Wikipedia badge/link on his
`/legislator/G000607` page) — hand-patched 2026-08-31 to
`James_Gallagher_(California_politician)` after the user supplied the real article URL. No
scripted mechanism was added for this — it's a manual, one-off fix, so a future
`congress-legislators`-sourced gap of this shape would need the same by-hand treatment again.

Base Next.js + Tailwind + TypeScript scaffold in place. Infra checklist (plan §7) mostly done:
GitHub repo pushed and tracked; Supabase project linked via CLI (credentials in gitignored
`.env.local`); schema applied as versioned migrations (`supabase/migrations/`); Vercel project
connected with Vercel Authentication as the deployment gate; Supabase env vars wired to both
Vercel and local `.env.local`. Not Vercel Cron as the plan originally sketched — `governors.mjs`
rate-limits itself to ~70-100+s, tight against Vercel's 300s function timeout, so a plain
GitHub Actions workflow running the existing `npm run sync:*` scripts unchanged was the
lower-risk choice. Four workflows: `politicians-sync.yml` (`states`/`legislators`/`governors`/
`governor_terms`, weekly, Monday 06:00 UTC — renamed from `sync.yml` 2026-09-02, once
`sports-sync.yml` below existed too and the original generic name stopped disambiguating
anything), `races-sync.yml` (`races_2026`, its own cadence so it can be paused after the last
2026 primaries (Sep 15) and resumed near the Nov 3 general independently of the other syncs —
`RACES_SCOPE=pending` on the normal cadence, see `docs/data-sync-notes.md`; offset an hour to Monday
07:00 UTC as of 2026-08-30 so it doesn't start at the exact same moment as `politicians-sync.yml`,
both of which can hit Wikipedia's REST API), `candidate-bio-backfill.yml` (every 3 hours), and
`sports-sync.yml` (`sports`/`college_football_programs`/`college_basketball_programs`,
added 2026-09-02 — `workflow_dispatch` only, deliberately no `schedule:`, so it exists on the
Actions tab for an on-demand run but doesn't add its own recurring Wikipedia-rate-limit pressure
on top of the three already-scheduled workflows above). Needs three repo secrets
(Settings → Secrets and variables → Actions): `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `OPENSTATES_API_KEY`. Each sync step runs independently
(`continue-on-error`, so one external API having a bad day doesn't skip the others), but a
final step re-checks each step's outcome and fails the overall run if any genuinely
errored — `continue-on-error` alone silently reports the whole job as "success" even when a
step fails, caught from a real run where this masked an OpenStates rate-limit failure.
`districts` stays manual-only (redistricting is ~once/decade, per plan §6).

`legislators.mjs`/`governor-history.mjs`'s current/recent scoping and `legislators.wikipedia_title`
are documented in `docs/data-sync-notes.md`, not repeated here.

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

**Home page** (`src/app/page.tsx` + `UsMap.tsx`): interactive MapLibre map, two modes (see UI
conventions) — States (default, current Senate delegation) and Districts (current House
delegation). Clicking either selects a state (Districts additionally tracks which district).
Zoom +/- buttons bottom-right; Alaska/Hawaii insets and state abbreviation labels always
visible in both modes (see `docs/data-sync-notes.md`/`docs/ui-notes.md`). The side panel (`StatePanel.tsx`) shows real
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
window. **Deliberately kept this way, not a lingering TODO** (revisited and reaffirmed
2026-08-31): a per-state exact-inauguration-date table was considered and rejected — it would
only narrow a days-to-weeks window nobody's reported hitting, at the cost of sourcing 50 states'
real inauguration dates/rules from a primary source, for a codebase that otherwise treats
Congress's fixed Jan 3 convention as the one shared rule across offices. Accepted as the same
class of documented simplification as this app's other data-quality gaps, not surfaced as a
separate UI disclaimer (unlike the district-boundary one below, which is a much larger and much
more likely-to-matter gap). **A separate, unrelated gap**, also deliberately accepted rather than
fixed: NJ/VA and, on their own distinct odd-year cycle, KY/MS/LA hold gubernatorial elections
entirely off the even-year cycle `ELECTION_YEARS` offers — `getGovernorAsOf` still returns a
correct answer for any of these (it queries "who held office on this date," not "who won an
election this year," so it never errors or returns nothing), but picking a year with no actual
election in one of these states shows a governor elected in some earlier year next to a selector
that implies "elected in Y." Fixing the Jan 3 approximation above does nothing for this — it's a
labeling/framing question, not a date-precision one — and was left equally unaddressed after the
same review, for the same reason (rare to actually notice; needs a specific state + specific year
click to surface). Would need its own disclaimer if ever revisited, not a data fix.
Picks the latest-starting match defensively
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
rather than "(current)" text — see `docs/ui-notes.md`; `getHouseHistory()` mirrors
`getSenateHistory()`); geography (real, added 2026-08-31, Overview section redesigned shortly
after — a taller "letterhead"-style flag banner above three labeled stats (Capital/Population/
Region, each value set in `font-display` per CLAUDE.md's Fraunces-for-big-numbers convention)
instead of the original small inline flag + one middot-joined sentence; plain `gap-x-6 gap-y-2`
spacing between the three stats rather than `divide-x` dividers, since dividers are drawn from DOM
adjacency and don't degrade gracefully once an item wraps to its own line — caught live on
Missouri/Utah, the two longest capital names in the dataset (Jefferson City/Salt Lake City, both
14 characters), where the wrapped "Region" stat was left with an orphaned indent and no divider
before it; a "Most populous cities" table with a capital badge (its own `min-w-[24rem]`, copied
from the unrelated multi-column History table, was removed after being caught clipping the
population column on mobile — the table has only 2 columns and never needed a fixed minimum
width), a "Sports teams" section grouped into collapsible per-league sections (pro leagues from
`sports_teams` plus trailing "NCAA Football (FBS)"/"NCAA Basketball (D1)" groups from
`college_football_programs`/`college_basketball_programs`, added 2026-09-02 — see the
`college-football.mjs`/`college-basketball.mjs` entries in `docs/data-sync-notes.md`), all from
`src/lib/geography-data.ts`; see the `geography.mjs`/`sports.mjs` entry in `docs/data-sync-notes.md`
for the pro-league sync itself); 2026 midterms
(real — Senate, Governor, AND House races for this state, per-candidate party + incumbent flag;
a House race's `Section` title includes its district number/"At-large" since a state can have
dozens of them, sorted by district — see `raceSectionTitle()`/`OFFICE_ORDER` in `StateTabs.tsx`;
a race with an unresolved primary shows a disclaimer instead of raw candidate text —
see `isPrimaryPending()` above). **The selected tab is mirrored into the URL** (`?tab=`, added
2026-09-02) via `router.replace`, same pattern `page.tsx` already uses for
`?state=`/`?year=` — tab selection previously lived only in local `useState`, so clicking a
candidate/legislator/governor link from a non-default tab and hitting the browser's back button
always landed back on "Current representation" instead of the tab the user was actually on.

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

**`/candidate/[id]`** (added 2026-08-29, see the `candidates` table entry in
`docs/data-sync-notes.md`): photo, party, office/state, incumbent flag, and a best-effort Wikipedia bio (with a fixed
disclaimer) for a 2026 race candidate with no existing `/legislator`/`/governor` profile. `id`
is a stable slug computed at sync time, not a uuid — survives `race_candidates`' weekly
delete-and-reinsert churn. `candidateHref()` decides per candidate: a matched current
officeholder's name links straight to their existing profile (no duplicate content); everyone
else links here. Originally lived inline in `RaceRow.tsx`; extracted into `races-data.ts`
2026-09-02 once `StateTabs.tsx`'s own Midterms tab was caught rendering candidate names as plain
text instead of linking them the same way `/midterms-2026`'s `RaceRow` already did — both
consumers now share the one function rather than `StateTabs.tsx` growing its own copy.

**`/team/[id]`, `/college-football/[id]`, `/college-basketball/[id]`** (added 2026-09-02, see the
`logo_url`/`bio_summary` entry in `docs/data-sync-notes.md`): individual pages for a
`sports_teams`/`college_football_programs`/`college_basketball_programs` row — logo, name (plus
nickname/conference for the college tables), home city linked to `/state/[abbr]`, and a
Wikipedia-sourced bio. All three routes render one shared `TeamProfile` component
(`src/components/TeamProfile.tsx`) rather than tripling the layout, since the three tables' shapes
differ only in field names (`league` vs. `conference`, no `nickname` on pro teams). Bios here get
a new `WikipediaSourcedBadge` source variant, `"wikipedia-list"` — sourced by matching the
wikilink TARGET on Wikipedia's own team/program list page directly (`extractLinkTarget()`), not a
name search, so like the `"congress-legislators"`/`"wikidata"` variants it carries none of the
candidates table's wrong-person risk, just without an equivalent ID lookup to point to. `/state/
[abbr]`'s Sports teams section links team/program names to these pages now instead of straight
out to Wikipedia (the external link moved onto the detail page itself, as the badge) — same
pattern `RepresentativesList.tsx` already uses for `/legislator/[id]` over a direct Wikipedia
link. Each page's footer shows that exact row's own `last_synced_at` (added 2026-09-03, via
`TeamProfile`'s `lastSyncedAt` field on `TeamProfileData`) — see the Data-freshness indicators
entry in `docs/ui-notes.md` for the full per-row-vs-per-job writeup and the `GlobalFooter` design this
replaced.

**Synced data**, via `npm run sync:<name>`:
- `states` — minimal id/name seed (`us-atlas` + `fips-to-abbr.json`), 50 states + DC.
- `legislators`/`terms` — current + full historical House and Senate terms, from
  `unitedstates/congress-legislators`. `bio_summary`/`photo_url` backfill from Wikipedia runs on
  its own frequent schedule (see the GitHub Actions note above) since the ~12,700-person
  population takes multiple days to converge — check progress via `legislators.bio_summary is
  not null` count, not `photo_url` (always set to a guessed `unitedstates/images` URL upfront,
  regardless of backfill progress).
- `governors` — current governor per state, from OpenStates v3 (`OPENSTATES_API_KEY` required).
  See the gotchas in `docs/data-sync-notes.md` before re-running or modifying this one.
- `governor_terms` — full governor history back to statehood, from Wikidata (2,425 rows across
  50 states, no key), plus photo/bio for 2,287/2,287 distinct people (100%) from the
  Wikipedia REST API. See the gotchas in `docs/data-sync-notes.md` before re-running or modifying
  this one.
- `races_2026`/`race_candidates` — Senate, Governor, AND House races, from Wikipedia (506
  races: 35 Senate, 36 Governor, 435 House — confirmed live, 435 exactly matches the real total
  House seat count, no key). See the gotchas in `docs/data-sync-notes.md` before re-running or
  modifying this one — House in particular needs its own gotcha entry, see there.
- `candidates` — challenger candidates with no existing legislator/governor profile, matched and
  upserted as part of the same `races_2026` sync, bio/photo backfilled via best-effort Wikipedia
  search. See the relevant entry in `docs/data-sync-notes.md`.
- `districts` (metadata table) + `district-geometry/topology.json` (Storage blob) — current
  (119th Congress) House boundaries from the Census Bureau, 436 districts. See
  `docs/data-sync-notes.md` on why geometry isn't a table column.
- `fips-to-abbr.json` — static FIPS↔abbreviation table, shared by multiple scripts and
  `src/lib/state-fips.ts`.
- `geography` (`cities` + `states.population`/`region`/`flag_url`/`capital_city_id`) — top 10
  most populous cities + capital/population/flag/region per state, from World Population Review,
  no key. Fully rewritten 2026-09-01, replacing an earlier Wikidata-based version — no
  `population-overlay` companion script anymore (it existed briefly, then got folded into this
  one). See the relevant entry in `docs/data-sync-notes.md` for the full writeup.
- `sports` (`sports_teams`) — NFL/NBA/MLB/NHL/MLS/WNBA/NWSL teams, from Wikipedia's team-list page
  (172 US teams across 7 leagues, confirmed live, no key — WNBA/NWSL added 2026-09-02). No
  dependency on `sync:geography` having run first (dropped its `cities` FK in the same 2026-09-01
  revamp — stores its own city name/state directly). See the relevant entry in `docs/data-sync-notes.md` —
  includes why this isn't TheSportsDB despite the plan's original suggestion. `logo_url`/
  `bio_summary` (added 2026-09-02) backfilled from Wikipedia the same run, powering `/team/[id]`
  — **100% coverage (172/172) confirmed live** as of 2026-09-02, after several real
  reliability fixes (see the relevant entry in `docs/data-sync-notes.md`).
- `college_football` (`college_football_programs`) — NCAA Division I FBS programs, from
  Wikipedia's "List of NCAA Division I FBS football programs" (138 schools, confirmed live, no
  key). Added 2026-09-02. A deliberately separate table from `sports_teams`, not a shared one —
  see the relevant entry in `docs/data-sync-notes.md` for the full writeup. `logo_url`/`bio_summary` (added
  2026-09-02) — **100% coverage (138/138) confirmed live**, powering `/college-football/[id]`
  (Georgia Southern's confirmed-no-Wikipedia-logo gap closed by hand, same as the basketball
  entry below).
- `college_basketball` (`college_basketball_programs`) — NCAA Division I men's basketball
  programs, joined from two Wikipedia pages (365 schools, confirmed live, no key). Added shortly
  after college football. Shares `college_football_programs`' exact row shape but is its own
  table/sync job — see the relevant entry in `docs/data-sync-notes.md` for the two-page join and the two real
  bugs caught while building it. `logo_url`/`bio_summary` (added 2026-09-02) — **100% bio
  coverage (365/365), 361/365 logo coverage confirmed live** as of 2026-09-02; the 4 remaining
  gaps (Purdue Fort Wayne, Morgan State, East Texas A&M, Campbell) are confirmed genuine
  no-Wikipedia-logo cases, closed by hand the same way as Georgia Southern above. Needed several
  real fixes along the way — a malformed `school` name, a stale-row cleanup bug, a fallback
  error-swallowing bug, and two rounds of retry-budget tuning — all documented in the
  `logo_url`/`bio_summary` entry in `docs/data-sync-notes.md`.
