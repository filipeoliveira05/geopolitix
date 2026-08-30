import { supabase } from "./supabase";
import { knownPendingPrimaryLabel } from "./pending-primary-states";

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
  matchedLegislatorId: string | null;
  matchedGovernorId: string | null;
  candidateId: string | null;
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
    matched_legislator_id: string | null;
    matched_governor_id: string | null;
    candidate_id: string | null;
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
      matchedLegislatorId: c.matched_legislator_id,
      matchedGovernorId: c.matched_governor_id,
      candidateId: c.candidate_id,
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

/**
 * Like isPrimaryPending(), but also cross-checks the 4 states with a known
 * still-pending 2026 primary (see pending-primary-states.ts) — catches a
 * case isPrimaryPending() can't: Wikipedia listing a confident-looking name
 * for an unresolved primary with no "TBD"/"(presumptive)" hedge at all
 * (confirmed live: MA's Jim McGovern/Ayanna Pressley House races). Returns
 * a message to show in place of candidates, or null when there's nothing to
 * flag — the known-date check takes priority so its dated message wins over
 * the generic one when both would otherwise apply.
 */
export function primaryPendingMessage(race: Race): string | null {
  const knownDate = knownPendingPrimaryLabel(race.stateId);
  if (knownDate) return `Primary not yet held (${knownDate}).`;
  if (isPrimaryPending(race)) return "Primary not yet held.";
  return null;
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

/**
 * Senate + Governor races nationwide, with full candidate detail — small
 * enough (~71 rows) to fetch eagerly for /midterms-2026. House (435 races)
 * deliberately isn't included here — see getHouseRaceCountsByState()/
 * getHouseRacesForState() below, split out once fetching all 506 races'
 * candidates on every page load measurably slowed this page down.
 */
export async function getSenateAndGovernorRaces(): Promise<Race[]> {
  const { data, error } = await supabase
    .from("races_2026")
    .select(RACE_WITH_CANDIDATES_SELECT)
    .in("office", ["senate", "governor"]);
  if (error) throw error;
  return (data as unknown as RaceRow[]).map(fromRow);
}

export type HouseStateSummary = { stateId: string; total: number; called: number };

/**
 * Per-state House race counts — status only, no candidates join — for
 * /midterms-2026's collapsed per-state summary lines and the Scoreboard's
 * House card. Deliberately cheap: this is what runs on every page load,
 * unlike getHouseRacesForState() below which only runs once a user expands
 * that specific state.
 */
export async function getHouseRaceCountsByState(): Promise<HouseStateSummary[]> {
  const { data, error } = await supabase
    .from("races_2026")
    .select("state_id, status")
    .eq("office", "house");
  if (error) throw error;
  const byState = new Map<string, HouseStateSummary>();
  for (const row of data as unknown as { state_id: string; status: RaceStatus }[]) {
    const entry = byState.get(row.state_id) ?? { stateId: row.state_id, total: 0, called: 0 };
    entry.total++;
    if (row.status === "called") entry.called++;
    byState.set(row.state_id, entry);
  }
  return [...byState.values()].sort((a, b) => a.stateId.localeCompare(b.stateId));
}

/**
 * Full House race detail (candidates included) for one state — fetched
 * client-side only once a user expands that state's disclosure on
 * /midterms-2026, not upfront for all 50 states.
 */
export async function getHouseRacesForState(stateAbbr: string): Promise<Race[]> {
  const { data, error } = await supabase
    .from("races_2026")
    .select(RACE_WITH_CANDIDATES_SELECT)
    .eq("state_id", stateAbbr)
    .eq("office", "house");
  if (error) throw error;
  return (data as unknown as RaceRow[])
    .map(fromRow)
    .sort((a, b) => (a.districtNumber ?? 0) - (b.districtNumber ?? 0));
}
