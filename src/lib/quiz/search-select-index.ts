import Fuse from "fuse.js";
import type { CityFact, SportsTeam } from "@/lib/geography-data";
import type { TermWithLegislator } from "@/lib/legislators-data";
import type { SearchSelectEntry } from "./types";

const FUSE_OPTIONS = { keys: ["label"], threshold: 0.35, ignoreLocation: true };

/** Labeled "CityName, StateId" — several city names repeat across different states in the synced
 * pool (multiple "Portland"s), same disambiguation convention buildCityPopulationQuestions
 * already uses. */
export function buildCityEntries(cities: CityFact[]): SearchSelectEntry[] {
  return cities.map((c) => ({ id: c.cityId, label: `${c.cityName}, ${c.stateId}` }));
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
  return teams.map((t) => ({ id: t.id, label: t.name }));
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
