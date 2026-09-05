import Fuse from "fuse.js";
import type { CityFact, SportsTeam, StateFact } from "@/lib/geography-data";
import type { TermWithLegislator } from "@/lib/legislators-data";
import type { SearchSelectEntry } from "./types";

const FUSE_OPTIONS = { keys: ["label"], threshold: 0.35, ignoreLocation: true };

/**
 * Labeled by plain city name only — deliberately NOT suffixed with the state (unlike
 * buildCityPopulationQuestions' "CityName, StateId" convention elsewhere in this app), since this
 * index powers the "name cities in {state}" search-select question: showing the state right in
 * the autocomplete suggestion would hand the player the answer before they even click it. Several
 * city names do repeat across different states in the synced pool (multiple "Portland"s) — two
 * suggestions can render identically here, which is an acceptable ambiguity (matching still works
 * correctly via each entry's own `id`), not a bug, since telling them apart by name alone is
 * exactly the kind of thing a real player wouldn't be told either.
 */
export function buildCityEntries(cities: CityFact[]): SearchSelectEntry[] {
  return cities.map((c) => ({ id: c.cityId, label: c.cityName }));
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
      entries.push({ id: s.legislator.id, label: fullLegislatorName(s.legislator) });
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
