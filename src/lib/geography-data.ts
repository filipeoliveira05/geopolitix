import { supabase } from "./supabase";

// Reads the Supabase `states`/`cities`/`sports_teams` tables (plan §4,
// Phase 2), synced via `npm run sync:geography` / `npm run sync:sports`
// (see scripts/sync/geography.mjs, scripts/sync/sports.mjs).

export type StateGeography = {
  stateId: string;
  population: number | null;
  region: string | null;
  flagUrl: string | null;
  capitalCityId: string | null;
  capitalName: string | null;
};

export type City = {
  id: string;
  name: string;
  stateId: string;
  population: number | null;
  isCapital: boolean;
  latitude: number | null;
  longitude: number | null;
};

export type SportsTeam = {
  id: string;
  name: string;
  league: string;
  cityId: string;
  cityName: string;
};

type StateRow = {
  id: string;
  population: number | null;
  region: string | null;
  flag_url: string | null;
  capital_city_id: string | null;
};

type CityRow = {
  id: string;
  name: string;
  state_id: string;
  population: number | null;
  is_capital: boolean;
  latitude: number | null;
  longitude: number | null;
};

function cityFromRow(row: CityRow): City {
  return {
    id: row.id,
    name: row.name,
    stateId: row.state_id,
    population: row.population,
    isCapital: row.is_capital,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

export async function getStateGeography(stateAbbr: string): Promise<StateGeography | null> {
  const { data, error } = await supabase
    .from("states")
    .select("id, population, region, flag_url, capital_city_id")
    .eq("id", stateAbbr)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as StateRow;

  let capitalName: string | null = null;
  if (row.capital_city_id) {
    const { data: capital, error: capitalError } = await supabase
      .from("cities")
      .select("name")
      .eq("id", row.capital_city_id)
      .maybeSingle();
    if (capitalError) throw capitalError;
    capitalName = capital?.name ?? null;
  }

  return {
    stateId: row.id,
    population: row.population,
    region: row.region,
    flagUrl: row.flag_url,
    capitalCityId: row.capital_city_id,
    capitalName,
  };
}

/** All synced cities for a state (top 10 by population + capital), most populous first. */
export async function getCitiesForState(stateAbbr: string): Promise<City[]> {
  const { data, error } = await supabase.from("cities").select("*").eq("state_id", stateAbbr);
  if (error) throw error;
  return (data as unknown as CityRow[])
    .map(cityFromRow)
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
}

type SportsTeamRow = {
  id: string;
  name: string;
  league: string;
  city_id: string;
  cities: { name: string } | null;
};

/** Every major-league sports team whose home city is in this state. */
export async function getSportsTeamsForState(stateAbbr: string): Promise<SportsTeam[]> {
  const { data, error } = await supabase
    .from("sports_teams")
    .select("id, name, league, city_id, cities!inner(name, state_id)")
    .eq("cities.state_id", stateAbbr);
  if (error) throw error;
  return (data as unknown as SportsTeamRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    league: row.league,
    cityId: row.city_id,
    cityName: row.cities?.name ?? "",
  }));
}
