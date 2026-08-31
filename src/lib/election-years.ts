// Shared by the home map's year dropdown (UsMap.tsx), the state panel
// (StatePanel.tsx), and page.tsx, which lifts the selected year so both can
// stay in sync — see docs/superpowers/specs/2026-08-31-global-search-nav-design.md's
// sibling design discussion for the map/panel-consistency decision.
export type ElectionYear = "current" | number;

// Even years back to 2000 — recent political memory without an unwieldy
// dropdown. Full historical term data exists much further back
// (legislators.mjs syncs all chambers back to 1789) if this range is ever
// widened later — that's a longer list, not a new mechanism.
export const ELECTION_YEARS: ElectionYear[] = [
  "current",
  2024,
  2022,
  2020,
  2018,
  2016,
  2014,
  2012,
  2010,
  2008,
  2006,
  2004,
  2002,
  2000,
];

/**
 * "current" -> null (today's actual `is_current = true` officeholders); a
 * specific year Y -> the day that Congress convened after Y's November
 * election ("${Y+1}-01-03", matching how `terms.start_date` already records
 * a regular term's start) — i.e. selecting a year shows the Congress
 * ELECTED that year, not whoever held office on some date within that
 * calendar year. Worth remembering: as of writing (2026-08-31), "current"
 * is actually the 119th Congress, elected in 2024 — the 2026 midterms
 * haven't happened yet (that's what /midterms-2026 tracks separately, as
 * upcoming).
 */
export function asOfDateForYear(year: ElectionYear): string | null {
  return year === "current" ? null : `${year + 1}-01-03`;
}

// Current House district geometry is the 119th Congress's (post-2020-census)
// lines, which took effect starting the 2022 election cycle in most states.
// Mid-decade redistricting in a handful of states since means this is a
// reasonable cutoff, not a per-state guarantee — years before it get a
// disclaimer in the Districts legend rather than being silently wrong.
export function districtBoundariesReliable(year: ElectionYear): boolean {
  return year === "current" || year >= 2022;
}

export function yearLabel(year: ElectionYear): string {
  return year === "current" ? "Current" : String(year);
}

/**
 * Parses the home page's `?year=` search param (page.tsx mirrors the
 * selected year into the URL the same way it already does `?state=`, so a
 * refresh/share preserves it) — anything missing or not one of
 * ELECTION_YEARS falls back to "current" rather than an invalid/unusable
 * selection (e.g. a hand-edited or stale URL).
 */
export function parseElectionYearParam(raw: string | null): ElectionYear {
  if (!raw) return "current";
  const n = Number(raw);
  return ELECTION_YEARS.includes(n) ? n : "current";
}
