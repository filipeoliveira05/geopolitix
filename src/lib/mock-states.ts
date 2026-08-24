// MOCK DATA — stands in for the Supabase `states`/`terms`/`governors` tables
// (see geopolitix-app-plan.md §4) until a real Supabase project is wired up.
// Only a handful of states are populated; unpopulated states render on the
// map but show "no data yet" in the panel. Replace with a Supabase query
// (e.g. a `getStateSummary(abbr)` in src/lib/data.ts) once the DB exists —
// keep this shape so the swap is a one-file change.

export type MockSenator = {
  name: string;
  party: "D" | "R" | "I";
};

export type MockStateSummary = {
  abbr: string;
  capital: string;
  population: number;
  senators: [MockSenator, MockSenator];
  governor: { name: string; party: "D" | "R" | "I" };
};

export const MOCK_STATES: Record<string, MockStateSummary> = {
  CA: {
    abbr: "CA",
    capital: "Sacramento",
    population: 39_431_263,
    senators: [
      { name: "Alex Padilla", party: "D" },
      { name: "Adam Schiff", party: "D" },
    ],
    governor: { name: "Gavin Newsom", party: "D" },
  },
  TX: {
    abbr: "TX",
    capital: "Austin",
    population: 31_290_831,
    senators: [
      { name: "John Cornyn", party: "R" },
      { name: "Ted Cruz", party: "R" },
    ],
    governor: { name: "Greg Abbott", party: "R" },
  },
  NY: {
    abbr: "NY",
    capital: "Albany",
    population: 19_867_248,
    senators: [
      { name: "Chuck Schumer", party: "D" },
      { name: "Kirsten Gillibrand", party: "D" },
    ],
    governor: { name: "Kathy Hochul", party: "D" },
  },
  FL: {
    abbr: "FL",
    capital: "Tallahassee",
    population: 23_372_215,
    senators: [
      { name: "Rick Scott", party: "R" },
      { name: "Ashley Moody", party: "R" },
    ],
    governor: { name: "Ron DeSantis", party: "R" },
  },
};

export function getMockStateSummary(abbr: string): MockStateSummary | null {
  return MOCK_STATES[abbr] ?? null;
}
