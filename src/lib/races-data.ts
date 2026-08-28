import { supabase } from "./supabase";

// Reads the Supabase `races_2026`/`race_candidates` tables (plan §4), synced
// via `npm run sync:races` (see scripts/sync/races-2026.mjs) — Senate,
// Governor, and House.

export type RaceOffice = "house" | "senate" | "governor";
export type RaceStatus = "open" | "called";

export type RaceCandidate = {
  id: string;
  name: string;
  party: string | null;
  isIncumbent: boolean;
};

export type Race = {
  id: string;
  office: RaceOffice;
  stateId: string;
  // House-only (state-level Senate/Governor races have no district) — 0
  // means at-large, matching the same convention terms.district_number
  // already uses for a single-district state's House seat.
  districtNumber: number | null;
  status: RaceStatus;
  winnerCandidateId: string | null;
  candidates: RaceCandidate[];
};

type RaceRow = {
  id: string;
  office: RaceOffice;
  state_id: string;
  district_number: number | null;
  status: RaceStatus;
  winner_candidate_id: string | null;
  race_candidates: {
    id: string;
    name: string;
    party: string | null;
    is_incumbent: boolean;
  }[];
};

function fromRow(row: RaceRow): Race {
  return {
    id: row.id,
    office: row.office,
    stateId: row.state_id,
    districtNumber: row.district_number,
    status: row.status,
    winnerCandidateId: row.winner_candidate_id,
    candidates: row.race_candidates.map((c) => ({
      id: c.id,
      name: c.name,
      party: c.party,
      isIncumbent: c.is_incumbent,
    })),
  };
}

const RACE_WITH_CANDIDATES_SELECT = "*, race_candidates!race_candidates_race_id_fkey(*)";

/**
 * True when at least one candidate is a placeholder rather than a real name — Wikipedia's own
 * infobox convention for a party's nominee slot the primary hasn't resolved yet: a literal
 * "TBD" when there's no clear frontrunner, or "<name> (presumptive)" when there is one but it
 * isn't official. Both come straight through from the synced text (see
 * scripts/sync/races-2026.mjs), not something we tag ourselves — so this only needs to notice
 * the pattern, not track primary dates or anything else that would need separate upkeep.
 */
export function isPrimaryPending(race: Race): boolean {
  return (
    race.candidates.length === 0 ||
    race.candidates.some(
      (c) => c.name.trim().toUpperCase() === "TBD" || /\(presumptive\)/i.test(c.name),
    )
  );
}

export async function getRacesForState(stateAbbr: string): Promise<Race[]> {
  // race_candidates has two FKs into races_2026 (race_id and
  // winner_candidate_id) — PostgREST can't infer which one to embed on
  // without being told explicitly.
  const { data, error } = await supabase
    .from("races_2026")
    .select(RACE_WITH_CANDIDATES_SELECT)
    .eq("state_id", stateAbbr);
  if (error) throw error;
  return (data as unknown as RaceRow[]).map(fromRow);
}

/** Every Senate + Governor race nationwide — for the /midterms-2026 scoreboard. */
export async function getAllRaces(): Promise<Race[]> {
  const { data, error } = await supabase.from("races_2026").select(RACE_WITH_CANDIDATES_SELECT);
  if (error) throw error;
  return (data as unknown as RaceRow[]).map(fromRow);
}
