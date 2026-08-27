import { supabase } from "./supabase";

// Reads the Supabase `governors` table (plan §4), synced via
// `npm run sync:governors` (see scripts/sync/governors.mjs).

export type Governor = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  bioSummary: string | null;
  stateId: string;
  party: string | null;
  startDate: string | null;
  endDate: string | null;
};

type GovernorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  bio_summary: string | null;
  state_id: string;
  party: string | null;
  start_date: string | null;
  end_date: string | null;
};

function fromRow(row: GovernorRow): Governor {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    photoUrl: row.photo_url,
    bioSummary: row.bio_summary,
    stateId: row.state_id,
    party: row.party,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

export async function getGovernorById(id: string): Promise<Governor | null> {
  const { data, error } = await supabase.from("governors").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as unknown as GovernorRow) : null;
}

export async function getGovernor(stateAbbr: string): Promise<Governor | null> {
  const { data, error } = await supabase
    .from("governors")
    .select("*")
    .eq("state_id", stateAbbr)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as unknown as GovernorRow) : null;
}

export function governorFullName(governor: Governor): string {
  return [governor.firstName, governor.lastName].filter(Boolean).join(" ");
}

// Full governor history per state, synced via `npm run sync:governor-history`
// (see scripts/sync/governor-history.mjs) — Wikidata, not OpenStates, since
// OpenStates has no history endpoint (only current officeholders, in
// `governors` above). Shaped like `race_candidates` (plain name/party, no
// required FK to a person table) rather than `terms` — historical governors
// predate OpenStates entirely and have no natural `governors.id` equivalent.

export type GovernorTerm = {
  id: string;
  stateId: string;
  governorId: string | null;
  wikidataPersonId: string;
  name: string;
  party: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
};

type GovernorTermRow = {
  id: string;
  state_id: string;
  governor_id: string | null;
  wikidata_person_id: string;
  name: string;
  party: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
};

function termFromRow(row: GovernorTermRow): GovernorTerm {
  return {
    id: row.id,
    stateId: row.state_id,
    governorId: row.governor_id,
    wikidataPersonId: row.wikidata_person_id,
    name: row.name,
    party: row.party,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current,
  };
}

/** Every governor term on record for a state, newest first (nulls-first start dates last). */
export async function getGovernorHistory(stateAbbr: string): Promise<GovernorTerm[]> {
  const { data, error } = await supabase
    .from("governor_terms")
    .select("*")
    .eq("state_id", stateAbbr);
  if (error) throw error;
  return (data as unknown as GovernorTermRow[])
    .map(termFromRow)
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
}

/**
 * Every term (current + any past non-consecutive ones) served by one
 * governor — for the /governor/[id] profile page, matching
 * getTermsForLegislator()'s shape on the legislator side. `governor_id` is
 * only ever set on a person's current term row (historical rows predate
 * OpenStates), so this looks up that row first to get the person's stable
 * `wikidata_person_id`, then matches every row sharing it.
 */
export async function getTermsForGovernor(
  governorId: string,
  stateAbbr: string,
): Promise<GovernorTerm[]> {
  const stateHistory = await getGovernorHistory(stateAbbr);
  const current = stateHistory.find((t) => t.governorId === governorId);
  if (!current) return [];
  return stateHistory.filter((t) => t.wikidataPersonId === current.wikidataPersonId);
}
