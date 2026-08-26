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
