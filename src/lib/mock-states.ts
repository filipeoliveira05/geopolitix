// MOCK DATA — stands in for the Supabase `states` table's capital/population
// fields (Phase 2 geography sync, not built yet). Only a handful of states
// are populated; unpopulated states render on the map but show no
// capital/population in the panel.
//
// Governors are no longer mocked here — see src/lib/governors-data.ts,
// synced from real data (OpenStates). Senators/representatives likewise —
// see src/lib/legislators-data.ts.

export type MockStateSummary = {
  abbr: string;
  capital: string;
  population: number;
};

export const MOCK_STATES: Record<string, MockStateSummary> = {
  CA: { abbr: "CA", capital: "Sacramento", population: 39_431_263 },
  TX: { abbr: "TX", capital: "Austin", population: 31_290_831 },
  NY: { abbr: "NY", capital: "Albany", population: 19_867_248 },
  FL: { abbr: "FL", capital: "Tallahassee", population: 23_372_215 },
};

export function getMockStateSummary(abbr: string): MockStateSummary | null {
  return MOCK_STATES[abbr] ?? null;
}
