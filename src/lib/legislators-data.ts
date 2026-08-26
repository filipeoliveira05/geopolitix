import { supabase } from "./supabase";

// Reads the Supabase `legislators`/`terms` tables (plan §4), synced via
// `npm run sync:legislators` (see scripts/sync/legislators.mjs).

export type Chamber = "house" | "senate";

export type Legislator = {
  id: string;
  bioguideId: string;
  govtrackId: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  birthday: string | null;
};

export type Term = {
  id: string;
  legislatorId: string;
  chamber: Chamber;
  stateId: string;
  district: number | null;
  party: string | null;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
};

export type TermWithLegislator = {
  legislator: Legislator;
  term: Term;
};

type TermRow = {
  id: string;
  legislator_id: string;
  chamber: Chamber;
  state_id: string;
  district_number: number | null;
  party: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  legislator: {
    id: string;
    bioguide_id: string;
    govtrack_id: string | null;
    first_name: string | null;
    last_name: string | null;
    photo_url: string | null;
    birthday: string | null;
  };
};

const TERM_WITH_LEGISLATOR_SELECT = "*, legislator:legislators(*)";

function fromRow(row: TermRow): TermWithLegislator {
  return {
    legislator: {
      id: row.legislator.id,
      bioguideId: row.legislator.bioguide_id,
      govtrackId: row.legislator.govtrack_id,
      firstName: row.legislator.first_name,
      lastName: row.legislator.last_name,
      photoUrl: row.legislator.photo_url,
      birthday: row.legislator.birthday,
    },
    term: {
      id: row.id,
      legislatorId: row.legislator_id,
      chamber: row.chamber,
      stateId: row.state_id,
      district: row.district_number,
      party: row.party,
      startDate: row.start_date,
      endDate: row.end_date,
      isCurrent: row.is_current,
    },
  };
}

async function getTerms(
  stateAbbr: string,
  chamber: Chamber,
  { currentOnly }: { currentOnly: boolean },
): Promise<TermWithLegislator[]> {
  let query = supabase
    .from("terms")
    .select(TERM_WITH_LEGISLATOR_SELECT)
    .eq("state_id", stateAbbr)
    .eq("chamber", chamber);
  if (currentOnly) query = query.eq("is_current", true);

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as TermRow[]).map(fromRow);
}

export async function getCurrentSenators(stateAbbr: string): Promise<TermWithLegislator[]> {
  return getTerms(stateAbbr, "senate", { currentOnly: true });
}

/**
 * Every state's current senators in one query, grouped by state — for
 * src/lib/senate-split-geo.ts, which otherwise would need one query per
 * state (51 round trips) to build the map's Senate layer.
 */
export async function getCurrentSenatorsByState(): Promise<Map<string, TermWithLegislator[]>> {
  const { data, error } = await supabase
    .from("terms")
    .select(TERM_WITH_LEGISLATOR_SELECT)
    .eq("chamber", "senate")
    .eq("is_current", true);
  if (error) throw error;

  const map = new Map<string, TermWithLegislator[]>();
  for (const row of data as unknown as TermRow[]) {
    const entry = fromRow(row);
    const existing = map.get(row.state_id);
    if (existing) existing.push(entry);
    else map.set(row.state_id, [entry]);
  }
  return map;
}

export async function getCurrentRepresentatives(
  stateAbbr: string,
): Promise<TermWithLegislator[]> {
  const terms = await getTerms(stateAbbr, "house", { currentOnly: true });
  return terms.sort((a, b) => (a.term.district ?? 0) - (b.term.district ?? 0));
}

/**
 * All Senate terms ever held for a state (current + past), newest first.
 * The plan's History tab (§5) only calls for senators/governors over time —
 * House history isn't in scope there, so no equivalent getter for the House.
 */
export async function getSenateHistory(stateAbbr: string): Promise<TermWithLegislator[]> {
  const terms = await getTerms(stateAbbr, "senate", { currentOnly: false });
  return terms.sort((a, b) => b.term.startDate.localeCompare(a.term.startDate));
}

/**
 * Current House member keyed by "STATE-DISTRICT" (e.g. "CA-12", "WY-0" for
 * at-large) — for joining onto district geometry (src/lib/districts-geo.ts)
 * so the map's district layer can be colored/labeled by current occupant.
 */
export async function getCurrentRepsByDistrictKey(): Promise<Map<string, TermWithLegislator>> {
  const { data, error } = await supabase
    .from("terms")
    .select(TERM_WITH_LEGISLATOR_SELECT)
    .eq("chamber", "house")
    .eq("is_current", true);
  if (error) throw error;

  const map = new Map<string, TermWithLegislator>();
  for (const row of data as unknown as TermRow[]) {
    if (row.district_number === null) continue;
    map.set(`${row.state_id}-${row.district_number}`, fromRow(row));
  }
  return map;
}

export function legislatorFullName(legislator: Legislator): string {
  return [legislator.firstName, legislator.lastName].filter(Boolean).join(" ");
}
