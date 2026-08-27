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
  bioSummary: string | null;
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
  legislator: LegislatorRow;
};

type LegislatorRow = {
  id: string;
  bioguide_id: string;
  govtrack_id: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  birthday: string | null;
  bio_summary: string | null;
};

const TERM_WITH_LEGISLATOR_SELECT = "*, legislator:legislators(*)";

function legislatorFromRow(row: LegislatorRow): Legislator {
  return {
    id: row.id,
    bioguideId: row.bioguide_id,
    govtrackId: row.govtrack_id,
    firstName: row.first_name,
    lastName: row.last_name,
    photoUrl: row.photo_url,
    birthday: row.birthday,
    bioSummary: row.bio_summary,
  };
}

function termFromRow(row: Omit<TermRow, "legislator">): Term {
  return {
    id: row.id,
    legislatorId: row.legislator_id,
    chamber: row.chamber,
    stateId: row.state_id,
    district: row.district_number,
    party: row.party,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current,
  };
}

function fromRow(row: TermRow): TermWithLegislator {
  return {
    legislator: legislatorFromRow(row.legislator),
    term: termFromRow(row),
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

let cachedRepsByDistrictKey: Promise<Map<string, TermWithLegislator>> | null = null;

/**
 * Current House member keyed by "STATE-DISTRICT" (e.g. "CA-12", "WY-0" for
 * at-large) — for joining onto district geometry (src/lib/districts-geo.ts)
 * so the map's district layer can be colored/labeled by current occupant.
 * Memoized like districts-geo.ts's own cache — UsMap.tsx only fetches this
 * on the first switch to "Districts" mode, but that can happen again after
 * a remount (e.g. navigating away and back to the map), and without this
 * cache that refetched every time even though the much larger topology
 * blob it's joined against didn't.
 */
export function getCurrentRepsByDistrictKey(): Promise<Map<string, TermWithLegislator>> {
  if (!cachedRepsByDistrictKey) cachedRepsByDistrictKey = fetchCurrentRepsByDistrictKey();
  return cachedRepsByDistrictKey;
}

async function fetchCurrentRepsByDistrictKey(): Promise<Map<string, TermWithLegislator>> {
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

export async function getLegislatorById(id: string): Promise<Legislator | null> {
  const { data, error } = await supabase.from("legislators").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? legislatorFromRow(data as unknown as LegislatorRow) : null;
}

/** All terms (any chamber, current + historical) for one legislator, newest first. */
export async function getTermsForLegislator(legislatorId: string): Promise<Term[]> {
  const { data, error } = await supabase
    .from("terms")
    .select("*")
    .eq("legislator_id", legislatorId);
  if (error) throw error;
  return (data as unknown as Omit<TermRow, "legislator">[])
    .map(termFromRow)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}
