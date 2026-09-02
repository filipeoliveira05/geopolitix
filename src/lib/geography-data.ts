import { supabase } from "./supabase";

// Reads the Supabase `states`/`cities`/`sports_teams`/`college_football_programs`/
// `college_basketball_programs` tables (plan §4, Phase 2), synced via `npm run sync:geography` /
// `npm run sync:sports` / `npm run sync:college-football` / `npm run sync:college-basketball`
// (see scripts/sync/geography.mjs, scripts/sync/sports.mjs, scripts/sync/college-football.mjs,
// scripts/sync/college-basketball.mjs). `states`/`cities`/`sports_teams` are sourced entirely
// from World Population Review as of 2026-09-01 (no Wikidata) — `cities` holds nothing but each
// state's real top 10 most populous cities + its capital, and `sports_teams` stores its own city
// name/state directly rather than through a `cities` FK (dropped in the same revamp — the FK's
// only use was rendering plain text like "New England Patriots (Foxborough)", no `/city/[id]`
// page exists or was ever planned), so no filtering/reconciliation logic is needed in either
// query below. The two `college_*_programs` tables (college football added 2026-09-02, college
// basketball added shortly after) are deliberately separate tables from `sports_teams` rather
// than new league values on it — see college_football_programs' migration comment — but share
// one identical row shape (`CollegeProgram`) and one query helper between themselves, since
// unlike sports_teams' many different leagues, these two really are the same shape twice.

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
};

export type SportsTeam = {
  id: string;
  name: string;
  league: string;
  cityName: string;
  wikipediaTitle: string | null;
  logoUrl: string | null;
};

// Shared shape for both college_football_programs and college_basketball_programs — identical
// columns in both tables (see college_basketball_programs' migration comment for why this is a
// second table rather than a sport column on one shared table: each is a separate, independently
// re-synced source, not different rows of the same underlying entity).
export type CollegeProgram = {
  id: string;
  school: string;
  nickname: string | null;
  cityName: string;
  conference: string | null;
  wikipediaTitle: string | null;
  logoUrl: string | null;
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
};

function cityFromRow(row: CityRow): City {
  return {
    id: row.id,
    name: row.name,
    stateId: row.state_id,
    population: row.population,
    isCapital: row.is_capital,
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

/** A state's top 10 most populous cities + its capital, most populous first. */
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
  city_name: string;
  wikipedia_title: string | null;
  logo_url: string | null;
};

/** Every major-league sports team whose home city is in this state. */
export async function getSportsTeamsForState(stateAbbr: string): Promise<SportsTeam[]> {
  const { data, error } = await supabase
    .from("sports_teams")
    .select("id, name, league, city_name, wikipedia_title, logo_url")
    .eq("state_id", stateAbbr);
  if (error) throw error;
  return (data as unknown as SportsTeamRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    league: row.league,
    cityName: row.city_name,
    wikipediaTitle: row.wikipedia_title,
    logoUrl: row.logo_url,
  }));
}

type CollegeProgramRow = {
  id: string;
  school: string;
  nickname: string | null;
  city_name: string;
  conference: string | null;
  wikipedia_title: string | null;
  logo_url: string | null;
};

async function getCollegeProgramsForState(
  table: "college_football_programs" | "college_basketball_programs",
  stateAbbr: string,
): Promise<CollegeProgram[]> {
  const { data, error } = await supabase
    .from(table)
    .select("id, school, nickname, city_name, conference, wikipedia_title, logo_url")
    .eq("state_id", stateAbbr);
  if (error) throw error;
  return (data as unknown as CollegeProgramRow[]).map((row) => ({
    id: row.id,
    school: row.school,
    nickname: row.nickname,
    cityName: row.city_name,
    conference: row.conference,
    wikipediaTitle: row.wikipedia_title,
    logoUrl: row.logo_url,
  }));
}

/** Every NCAA Division I FBS college football program in this state. */
export function getCollegeFootballForState(stateAbbr: string): Promise<CollegeProgram[]> {
  return getCollegeProgramsForState("college_football_programs", stateAbbr);
}

/** Every NCAA Division I men's basketball program in this state. */
export function getCollegeBasketballForState(stateAbbr: string): Promise<CollegeProgram[]> {
  return getCollegeProgramsForState("college_basketball_programs", stateAbbr);
}
