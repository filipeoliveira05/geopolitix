// A small, explicit exception list mapping a `sports_teams`/college row's `city_name` onto the
// `cities` row that actually has a page — the same shape of deliberate hardcoded exception as
// `pending-primary-states.ts`, and for the same reason: it encodes an orthographic/administrative
// quirk of the source data, not political or geographic *data* (which stays in Supabase per
// CLAUDE.md).
//
// Two real cases, both found by auditing every unmatched row live:
//   - Wikipedia's team infoboxes locate the Cubs and White Sox by Chicago side ("North Side
//     Chicago"), not by city, so neither appeared on Chicago's page at all.
//   - New York's teams are located by borough (Bronx, Queens, Brooklyn, Manhattan), so
//     /city/NY/new-york listed exactly one team — Columbia — while the Yankees, Mets, Knicks,
//     Nets, Rangers and Liberty all fell through.
//
// Explicitly NOT aliased: a team that genuinely plays in a separate municipality, however much
// its name suggests otherwise — the Islanders (Elmont, Nassau County), Giants/Jets (East
// Rutherford NJ), Red Bulls/Gotham (Harrison NJ), Patriots (Foxborough MA), Rams/Chargers/
// Clippers (Inglewood CA), 49ers (Santa Clara CA), Cowboys (Arlington TX). Those keep rendering
// as plain text with no city page, which is the accurate answer.
//
// `label` is the sub-place shown in parentheses next to the team on the aliased city's page
// ("New York Yankees (The Bronx)"), so folding a borough into New York never hides where the team
// really plays. A `null` label means the alias is a pure spelling variant of the same place
// ("New York City" -> "New York"), where a parenthetical would just repeat the city's own name.
type CityAlias = { citySlug: string; label: string | null };

// Keyed by `<STATE>/<slug of the raw city_name>` — state-scoped rather than global so a future
// "Brooklyn, OH" or "Manhattan, KS" can never be silently swallowed into New York City.
const CITY_ALIASES: Record<string, CityAlias> = {
  "IL/north-side-chicago": { citySlug: "chicago", label: "North Side" },
  "IL/south-side-chicago": { citySlug: "chicago", label: "South Side" },
  "NY/bronx": { citySlug: "new-york", label: "The Bronx" },
  "NY/brooklyn": { citySlug: "new-york", label: "Brooklyn" },
  "NY/manhattan": { citySlug: "new-york", label: "Manhattan" },
  "NY/queens": { citySlug: "new-york", label: "Queens" },
  "NY/staten-island": { citySlug: "new-york", label: "Staten Island" },
  "NY/new-york-city": { citySlug: "new-york", label: null },
};

export function lookupCityAlias(stateId: string, slug: string): CityAlias | null {
  return CITY_ALIASES[`${stateId.toUpperCase()}/${slug}`] ?? null;
}
