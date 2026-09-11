import Fuse from "fuse.js";
import type { CityFact, SportsTeam, StateFact } from "@/lib/geography-data";
import type { TermWithLegislator } from "@/lib/legislators-data";
import type { SearchSelectEntry } from "./types";

// `matchText` falls back to `label` via getFn rather than every entry builder redundantly setting
// matchText: label — only buildCityEntries below ever needs the two to diverge.
const FUSE_OPTIONS = {
  keys: [{ name: "matchText", getFn: (entry: SearchSelectEntry) => entry.matchText ?? entry.label }],
  threshold: 0.35,
  ignoreLocation: true,
};

/**
 * Suggestion labels are suffixed "CityName, ST" (buildCityPopulationQuestions' convention
 * elsewhere in this app) so a repeated city name (several "Jackson"s, "Portland"s, etc. exist
 * across the synced pool) is distinguishable in the autocomplete dropdown. Revealing the state in
 * the suggestion TEXT is safe — the "name cities in {state}" question this powers already tells
 * the player their target state in the prompt/flag, so the state was never the secret here — but
 * the state abbreviation must stay out of what's actually SEARCHABLE: `matchText` is the plain
 * city name only, so typing "MS" can't be used to browse every Mississippi city as a shortcut
 * around actually recalling their names (Fuse indexes `matchText`, not `label` — see
 * FUSE_OPTIONS above). If a future question ever reuses this shared "city" index for something
 * where the state IS the answer, the `label` suffix itself would need to move to a per-question
 * opt-in instead of being baked in here.
 */
export function buildCityEntries(cities: CityFact[]): SearchSelectEntry[] {
  return cities.map((c) => ({
    id: c.cityId,
    label: `${c.cityName}, ${c.stateId}`,
    matchText: c.cityName,
  }));
}

export function fullLegislatorName(legislator: { firstName: string | null; lastName: string | null }): string {
  return [legislator.firstName, legislator.lastName].filter(Boolean).join(" ");
}

export function buildSenatorEntries(
  senatorsByState: Map<string, TermWithLegislator[]>,
): SearchSelectEntry[] {
  const entries: SearchSelectEntry[] = [];
  for (const senators of senatorsByState.values()) {
    for (const s of senators) {
      entries.push({
        id: s.legislator.id,
        label: fullLegislatorName(s.legislator),
        party: s.term.party,
        photoUrl: s.legislator.photoUrl,
      });
    }
  }
  return entries;
}

export function buildTeamEntries(teams: SportsTeam[]): SearchSelectEntry[] {
  return teams.map((t) => ({ id: t.id, label: t.name, photoUrl: t.logoUrl, league: t.league }));
}

/** Powers the "name all states that border {state}" search-select question. */
export function buildStateEntries(states: StateFact[]): SearchSelectEntry[] {
  return states.map((s) => ({ id: s.stateId, label: s.stateName }));
}

/**
 * Builds a reusable fuzzy-search function over a fixed entry list. Builds ONE Fuse instance per
 * call — callers must call this once (e.g. per category-pool-fetch, via useMemo keyed on the
 * pool) and reuse the returned function across every keystroke, never rebuild it per render.
 */
export function createEntitySearch(entries: SearchSelectEntry[]) {
  const fuse = new Fuse(entries, FUSE_OPTIONS);
  return (query: string, maxResults = 8): SearchSelectEntry[] => {
    if (!query.trim()) return [];
    return fuse
      .search(query.trim())
      .slice(0, maxResults)
      .map((r) => r.item);
  };
}
