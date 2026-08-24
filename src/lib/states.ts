import { getUsStatesGeoJson } from "./us-states-geo";

export type StateInfo = { abbr: string; name: string };

let cachedStates: StateInfo[] | null = null;

/** All 50 states + DC, derived from the map's own geometry data (us-atlas). */
export function getAllStates(): StateInfo[] {
  if (!cachedStates) {
    cachedStates = getUsStatesGeoJson()
      .features.filter((f) => f.properties.abbr !== null)
      .map((f) => ({ abbr: f.properties.abbr as string, name: f.properties.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return cachedStates;
}

export function getStateName(abbr: string): string | null {
  return getAllStates().find((s) => s.abbr === abbr)?.name ?? null;
}

export function isValidStateAbbr(abbr: string): boolean {
  return getAllStates().some((s) => s.abbr === abbr);
}
