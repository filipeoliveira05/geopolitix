# UI Conventions — Full Notes

Full design-decision history and every real bug caught building this app's UI conventions
— referenced from `CLAUDE.md`'s UI conventions section, not duplicated there. Read before
touching the design system, map, tables, or the freshness/search/header components.

- **Design system ("Congressional Record" civic-almanac, added 2026-08-31):** CSS custom-property
  tokens in `globals.css` — `--paper`/`--surface`/`--ink`/`--muted`/`--rule`/`--seal`/`--seal-soft`,
  light values on `:root`, dark values under `prefers-color-scheme: dark` — mapped into Tailwind
  v4's `@theme inline` block as ordinary utilities (`bg-paper`, `text-ink`, `border-rule`, etc.).
  **These are already theme-aware — never pair one with a `dark:` Tailwind variant**; only
  genuinely semantic non-token colors (party colors below, the amber/emerald/sky pulse-dot
  conventions, error red) still need explicit `dark:` pairs. Three font roles via
  `next/font/google`: `font-display` (Fraunces — headings, person names, big numbers only, spent
  sparingly), `font-sans` (IBM Plex Sans, the `body` default — don't add the class explicitly),
  `font-mono` (IBM Plex Mono — dates, tallies, sync timestamps, any tabular numeric column; mono
  only the number itself, not a full phrase — wrapping an entire string like "8 hours ago" in
  font-mono puts its internal word-spaces in monospace's wider fixed-width glyph, visibly wider
  than the surrounding sans-serif text's spaces and misread as a stray double space, caught live
  in `SyncFreshnessNote.tsx`'s "X synced Y ago" text). **Separate gotcha, easy to conflate with
  that one because the visual symptom looks similar:** a lone single-space JSX text node sitting
  directly at an element boundary inside a `whitespace-nowrap` container collapses to zero width
  in Chromium, even when it's already its own isolated JSX child (`synced{" "}` followed by
  `<span>...` on the next line reads like the fix, but the plain-ASCII space inside those braces
  still silently collapsed — caught live as "synced1 hour ago", confirmed by a direct DOM
  measurement showing zero `getClientRects()` for that text node). The actual fix is a literal
  non-breaking space escape (`"\u00A0"`) in place of the plain `" "` — NBSP (U+00A0) is defined
  as non-collapsible in CSS and always holds real width regardless of position. Always write it
  as the explicit `"\u00A0"` string escape, never a pasted literal NBSP character — the latter
  is visually indistinguishable from a normal space in an editor/diff, and a well-meaning
  plain-space edit on top of one silently reverts to collapsing again with no visible diff
  explaining why. **Separate gotcha, same neighborhood: never call `.toLocaleString()`/
  `Intl.NumberFormat` with no explicit locale on anything server-rendered** (fixed 2026-09-03,
  `src/lib/format.ts`'s `formatPopulation()`) — the default locale is the *runtime's* locale, which
  is the Node server's during SSR but the *browser's* during client hydration, and these aren't
  guaranteed to agree. Caught live as a real hydration-mismatch error on `/state/[abbr]`
  (`4,148,818` server-rendered vs. `4 148 818` on a client whose browser locale grouped
  thousands differently) — React discards and regenerates the whole subtree when this happens, not
  just a cosmetic diff. `formatPopulation()` replaces every population `.toLocaleString()` call
  (`StatePanel.tsx`, `StateTabs.tsx` ×2) with plain regex-based space insertion instead of any
  locale API, so the output is byte-identical on every render regardless of server/client locale —
  chosen over pinning an explicit locale string (e.g. `.toLocaleString("en-US")`, tried first and
  verified to also fix the mismatch) partly per user preference for a space separator, and partly
  because even a fixed locale's grouping character isn't guaranteed byte-identical across different
  ICU versions between Node and a browser. Radius is plain Tailwind `rounded` (4px) everywhere, never
  `rounded-md`/`-lg`/`-xl`; no `box-shadow` on any surface (the `SearchOverlay` backdrop scrim is
  the one exception). Shared primitives: `Card` (`src/components/Card.tsx`, a bordered
  `bg-surface` wrapper), `SectionHeading` (`src/components/SectionHeading.tsx`, the
  uppercase-tracked eyebrow label prefixed with a `§` mark in `--seal` — deliberately reconsidered
  against alternatives (a seal-colored accent bar, a pilcrow, no mark at all) and kept as-is, don't
  re-litigate), `BackToMapLink` (`src/components/BackToMapLink.tsx`, the "← Back to map" link
  every non-home page uses). The `.link-accent` utility class (also in `globals.css`) replaces
  bare `hover:underline` on in-content text links — transparent underline at rest, `--seal`-colored
  on hover/focus. `.animate-fade-in` gives each top-level page's outer container a brief mount
  fade (respects `prefers-reduced-motion`) — applied once per page, not per-element. Full design
  rationale in `docs/superpowers/specs/2026-08-31-design-overhaul-design.md`.
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
  **The Sports teams section's per-row lists (pro teams, `CollegeProgramGroup`) are a real
  instance of this, not just a table** (fixed 2026-09-03) — each row's conference badge
  (`SUN BELT`/`CONFERENCE USA`/`BIG SOUTH`) originally sat in a `flex-wrap` container that could
  break mid-badge onto a second line on narrow screens, visibly misaligning the row. Fixed to a
  single non-wrapping `<li>` (`whitespace-nowrap`, `flex items-center`, no `flex-wrap`) inside its
  own `overflow-x-auto overflow-y-hidden` wrapper — a long row (name + badge + city) now scrolls
  horizontally within itself instead of wrapping, same convention as every other
  horizontally-scrolling content in this doc.
- **`/state/[abbr]`'s History tab (added 2026-08-31) splits its three tables differently, not
  uniformly** — flat, ungrouped Senate/House/Governor tables became unusably long once real
  data was in (confirmed live: California's House history alone is 2,207 rows, since the old
  list mixed every one of its ~52 districts' full 175-year history into one chronological
  table). House gets `HouseHistoryByDistrict` — grouped by `term.district`, each district a
  collapsed-by-default row (same interaction `HouseRacesByState.tsx` already established on
  `/midterms-2026`, reused for consistency, not reinvented) — shrinking CA's 2,207 rows into
  ~52 sections of ~40 each. Senate and Governor instead get `CappedHistorySection` (cap 15,
  "Show all N" expand) since neither is district-splittable — Senate has no stable per-seat id
  in the schema (just 2 undifferentiated slots per state), Governor has only one seat — and
  neither gets anywhere near House's row count anyway (CA: 79 Senate terms, 42 governor terms,
  vs. 2,207 House). Grouping by `district_number` is a display convenience only, not a claim of
  seat continuity — district lines have been redrawn many times since 1789 (see
  `getHouseHistory`'s own comment), stated as a one-line disclaimer above the grouped list, same
  spirit as the redistricting-boundary disclaimer already used elsewhere. **Surfaced a real,
  pre-existing data-display gap while building this, not introduced by it:** `congress-legislators`
  uses `district_number = -1` for pre-1967 (Apportionment Act) multi-member "general ticket"
  seats, distinct from `0` (a genuine single at-large seat) — confirmed live via CA's 22 such
  terms, 1849–1861. The app's other `district === 0 ? "At-large" : ...` call sites
  (`legislator/[id]/page.tsx`, `RepresentativesList.tsx`, every race/candidate page) never hit
  this, since current terms and 2026 races are all modern single-member districts — but History's
  new per-district grouping turns what used to be one easy-to-miss inline cell into its own
  group heading, which is what actually surfaced it. Fixed both here (`districtLabel()` in
  `StateTabs.tsx`) and in `legislator/[id]/page.tsx`'s own copy of the same unguarded check (its
  own local `districtLabel()`, same `-1` → "At-large (multi-member)" mapping) — confirmed live
  against G000172 (Edward Gilbert, one of CA's 1849 multi-member at-large reps).
  `RepresentativesList.tsx`/race pages were left unfixed — current terms/2026 races never carry
  `-1`, so it's unreachable dead code there, not a live gap.
- **"Live/pending" indicator convention:** a small `animate-pulse` colored dot — amber for a
  not-yet-decided race or the midterms countdown, emerald for "this is the current officeholder"
  in history tables. Place it `inline-block` with `align-middle` next to text that might wrap
  (not a `flex items-center` sibling) — flex-centering against a block that wraps to two lines
  misaligns the dot against the wrapped text; inline keeps it pinned to the line it's actually on.
- **Data-freshness indicators** (`SyncFreshnessNote`/`SyncFreshnessRow`, `src/lib/sync-freshness.ts`):
  small muted "X synced Y ago" text reading `sync_logs`, which every sync script now stamps with a
  stable `job` slug instead of relying on the free-text `source` field (which already varies by
  scope/mode within the same script). Each item is prefixed by a small dot reusing the app's
  "Live/pending" convention rather than a new one: pulsing emerald for synced within the last day
  (the one tier where "live" is an honest claim), static amber for 1-7 days, static neutral gray
  beyond that — same pulse-means-something discipline as `RaceRow`'s not-yet-decided dot elsewhere
  in the app.
  **Two levels, not one: per-job on hub pages, per-row on individual pages.** A hub page that
  summarizes many rows at once (`/state/[abbr]`, `/midterms-2026`) shows `getJobFreshness()` —
  "when did this whole sync job last run" — since there's no single row to point at. An individual
  entity page instead reads that exact row's own `last_synced_at` column directly, added to every
  table with its own detail page: `candidates` (2026-09-03, first), then `legislators`/`governors`/
  `governor_terms`/`sports_teams`/`college_football_programs`/`college_basketball_programs`
  (2026-09-03, same day, same pattern). **This replaced an earlier `GlobalFooter` design that
  showed a site-wide job-level fallback on every individual page** — caught live as actively
  misleading: `/college-football/[id]` read "synced 2 days ago" (the oldest of five unrelated
  "core" jobs — states/legislators/governors/governor_history/races, none of them college
  football) while the *same sync*'s own per-job note on `/state/[abbr]` read "10 hours ago" for
  the identical table. `GlobalFooter`/`getGlobalFreshness()`/`CORE_JOBS` are deleted entirely, not
  just superseded — nothing renders them anymore.
  **Every sync write path that actually touches a row stamps `last_synced_at`, not just the
  primary upsert** — the same class of bug already caught once (see `candidates.last_synced_at`'s
  own entry in `docs/data-sync-notes.md`, where `backfillCandidateBios()`'s update wasn't stamping it)
  recurred and was fixed proactively for the rest: `governor-history.mjs`'s
  `copyCurrentBiosToGovernors()` (the only place a current governor's bio/photo is actually
  written, since OpenStates never provides them) and both `legislators.mjs`/`governor-history.mjs`
  bio-backfill `.update()` calls all stamp it too, not just each table's row-construction/upsert
  step.
  **Real per-row differentiation, not just per-row plumbing** — `legislators`/`governor_terms`
  are the two tables where this actually shows different values on different rows in practice,
  since their weekly sync only rebuilds *current/recent* rows (`LEGISLATORS_SCOPE=current`/
  `GOVERNOR_HISTORY_SCOPE=current`); a genuinely historical row's `last_synced_at` only advances
  on an occasional full manual resync. Confirmed live: a current legislator read "2 days ago"
  while a purely historical one (never in `terms.is_current`) read "5 days ago" on the same day.
  `governors`/`sports_teams`/`college_football_programs`/`college_basketball_programs` do a
  full-table upsert every run, so every row in a given run shares one timestamp today — still the
  architecturally correct column to read from (and it self-corrects the moment any of these
  scripts ever adds partial-scope syncing), just not more granular than the job-level note already
  was for those four specifically.
  **Existing rows got a one-time manual backfill (2026-09-03), not left null** — same class of
  by-hand fix as this doc's other hand-patched gaps (Georgia Southern's logo, bioguide `G000607`),
  not a committed script: full-table-upsert tables were stamped uniformly with that job's latest
  `sync_logs` success (accurate, since that run genuinely touched every row); `legislators`/
  `governor_terms` were split — rows with a current term/`is_current=true` got the latest
  current-scope run's timestamp, everything else got the latest full-scope run's timestamp,
  determined from `sync_logs.source` (legislators' source string lists both YAML URLs on a full
  run, only the current one otherwise) and `sync_logs.triggered_by` (`governor_history`'s source
  string never varies by scope, but `triggered_by != "cron"` reliably means a manual/full run in
  practice, confirmed against real logged runs) — not fabricated, derived from what actually
  happened.
  `/midterms-2026` still shows one item (`SyncFreshnessNote`, a thin wrapper over
  `SyncFreshnessRow` for the single-item case) since races is one atomic sync covering
  Senate/Governor/House together — nothing to split. `/state/[abbr]` shows seven separate items via
  `SyncFreshnessRow` — Legislators/Governor/Governor history/Geography/Sports/College football/
  College basketball, each its own dot and timestamp — rather than one combined number. An
  earlier version used a single `getJobFreshness([...])` call across the first three, which takes
  the MOST RECENT of the group — caught live as dishonest in the same direction as the `GlobalFooter`
  problem above: it could read "synced 1 hour ago" while one of the jobs was actually days stale,
  silently hiding it behind whichever job happened to run most recently.
  **Collapses behind a toggle above 3 items (added once the row grew to 7)** — showing every job
  inline via `flex-wrap` ate a disproportionate amount of vertical space right under the page's
  H1 on mobile, where it wrapped across several lines. `SyncFreshnessRow` now renders a persistent
  one-line trigger (a dot colored by the STALEST item's own tier — an honest at-a-glance signal,
  not a fabricated combined status — plus a "Data freshness" label and a rotating chevron, same
  interaction `CollapsibleGroup` already uses) once `known.length` exceeds 3, toggling the
  identical full per-item row beneath it rather than replacing the trigger with it — an earlier
  version did the latter, which meant there was no way back to collapsed once expanded, fixed by
  keeping the trigger persistently visible in both states. A page with 3 or fewer items (e.g.
  `/midterms-2026`'s single race-sync note) renders exactly as it always did — no toggle added,
  since it already fits on one line. The home map (`/`) shows no freshness note at all — its
  `h-dvh` fullscreen layout has no room for one without either overflowing the viewport or getting
  clipped.
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
  2026" and "Quiz" (the latter lit up once Phase 3 shipped 2026-09-03 — flipping its disabled
  placeholder to a real `<Link>` needed no other functional change, as originally planned).
  **No "Geography" nav slot** — Phase 2's content lives entirely inside `/state/[abbr]`'s
  Geography tab, per-state, with no standalone `/geography` hub page a single top-level link
  could point to, so its own disabled placeholder was removed 2026-09-03 rather than lit up (a
  state-by-state feature, unlike Quiz/Midterms which each got one real hub route from the start).
  Revisit only if a dedicated geography hub page is ever built.
- **Global search (`SearchOverlay`, added 2026-08-31)** — opened from `GlobalHeader`'s search
  icon, an icon-triggered modal rather than an always-visible inline box (near-zero permanent
  header width, same interaction on mobile/desktop). Matches happen entirely client-side against a
  pre-fetched flat index (`src/lib/search-index.ts`'s `buildSearchIndex()` — legislators,
  governors incl. the OpenStates-gap/historical `governor_terms` fallback `getGovernor()` already
  uses, candidates, states from the free local `getAllStates()`, and — added 2026-09-03 —
  `sports_teams`/`college_football_programs`/`college_basketball_programs`, the three tables
  backing `/team/[id]`/`/college-football/[id]`/`/college-basketball/[id]`) via Fuse.js
  (`ignoreLocation: true` — without it, a typo late in a multi-word name like "Fetterrman" scored
  too low to surface "John Fetterman", confirmed live before adding this option), not a per-
  keystroke server query — "John Smith" as one string can't `ilike` split `first_name`/`last_name`
  columns without a SQL function, and the ~15,700-row population is small enough to hold in memory
  for the session instead. A college program's searchable `name` includes its nickname (e.g.
  "Virginia Cavaliers", not just "Virginia") so a mascot-only query still matches — same reasoning
  `CollegeProgramGroup`'s display line already combines school+nickname. **Matches on `subtitle`
  too, not just `name`** (added 2026-09-03) — `Fuse`'s `keys` is `[{name: "name", weight: 2},
  {name: "subtitle", weight: 1}]`, so office/league/state text sitting only in the subtitle (e.g.
  "NFL", "Senator") becomes searchable, while a name match (e.g. "Texas" finding the state itself,
  not every entry whose subtitle merely mentions "TX") still outranks a subtitle-only one thanks to
  the weight split. The index fetch is prefetched at idle (added 2026-09-03, replacing an
  earlier hover/focus/click-only trigger) — a `useEffect` on `GlobalHeader` mount calls
  `requestIdleCallback` (`setTimeout` fallback for Safari, which doesn't have it) to flip the same
  `wantsIndex` flag `useQuery`'s `enabled` reads, deferred so the fetch never competes with the
  current route's own render/data work for bandwidth or main-thread time; hover/focus/click on the
  search button still flip it too, belt-and-suspenders for the rare case someone opens search
  before the browser goes idle. `staleTime: Infinity` either way, so a session only ever fetches
  once — this just moves WHEN that one fetch starts, from "the user's about to need it" to "as
  soon as the app's likely done with its own work," which in practice means the "Loading search
  index…" flash a user actually hit on first open is gone in the common case. Departed legislators
  get a generic "Former member of Congress" subtitle rather than
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
  image optimizer). A person can legitimately lack a photo (see the coverage caveats elsewhere in
  this doc), which falls back to a fixed-size placeholder circle (a generic person icon) so rows
  stay aligned rather than being pushed left. **A state entry isn't a real gap the same way** —
  fixed shortly after launch: `buildStateEntries()` originally hardcoded `photoUrl: null` for
  every state (states have no `photo_url` column to read), but a state's flag is exactly the
  right image for this slot and needs no fetch to source — same predictable World Population
  Review URL pattern `geography.mjs` already constructs (`.../state-flags/w1280/<abbr>.png`), so
  `buildStateEntries()` builds it directly from `s.abbr`. Verified live: searching a state name
  now shows its real flag thumbnail, not the generic placeholder.
