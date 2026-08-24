// MOCK DATA — stands in for the Supabase `states`/`governors` tables (plan
// §4) until a real Supabase project (and an OpenStates-based governors sync)
// exist. Only a handful of states are populated; unpopulated states render
// on the map but show "no governor data yet" in the panel.
//
// Senators/representatives are no longer mocked here — see
// src/lib/legislators-data.ts, synced from real data.

export type MockStateSummary = {
  abbr: string;
  capital: string;
  population: number;
  governor: { name: string; party: string };
};

export const MOCK_STATES: Record<string, MockStateSummary> = {
  CA: {
    abbr: "CA",
    capital: "Sacramento",
    population: 39_431_263,
    governor: { name: "Gavin Newsom", party: "Democrat" },
  },
  TX: {
    abbr: "TX",
    capital: "Austin",
    population: 31_290_831,
    governor: { name: "Greg Abbott", party: "Republican" },
  },
  NY: {
    abbr: "NY",
    capital: "Albany",
    population: 19_867_248,
    governor: { name: "Kathy Hochul", party: "Democrat" },
  },
  FL: {
    abbr: "FL",
    capital: "Tallahassee",
    population: 23_372_215,
    governor: { name: "Ron DeSantis", party: "Republican" },
  },
};

export function getMockStateSummary(abbr: string): MockStateSummary | null {
  return MOCK_STATES[abbr] ?? null;
}
