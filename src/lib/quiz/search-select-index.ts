import Fuse from "fuse.js";
import type { CityFact, SportsTeam, StateFact } from "@/lib/geography-data";
import type { TermWithLegislator } from "@/lib/legislators-data";
import type { SearchSelectEntry } from "./types";

const FUSE_OPTIONS = { keys: ["label"], threshold: 0.35, ignoreLocation: true };

/**
 * Suggestion labels are suffixed "CityName, ST" (buildCityPopulationQuestions' convention
 * elsewhere in this app) so a repeated city name (several "Jackson"s, "Portland"s, etc. exist
 * across the synced pool) is distinguishable in the autocomplete dropdown. This is safe from a
 * spoiler standpoint specifically because this index's only consumer, the "name cities in
 * {state}" search-select question, already tells the player which state they're naming cities
 * for right in the prompt (plus shows its flag) — the state was never the secret here, so
 * revealing it a second time in the suggestion list gives nothing away. If a future question ever
 * reuses this shared "city" search index for something where the state IS the answer, this
 * suffix would need to move to a per-question opt-in instead of being baked in here.
 */
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
