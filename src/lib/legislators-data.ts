import { supabase } from "./supabase";
import { tallyPartyLetters } from "./party-colors";

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
  wikipediaTitle: string | null;
  wikipediaVerified: boolean;
  wikipediaCheckedNo: boolean;
  lastSyncedAt: Date | null;
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
  wikipedia_title: string | null;
  wikipedia_verified: boolean;
  wikipedia_checked_no: boolean;
  last_synced_at: string | null;
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
    wikipediaTitle: row.wikipedia_title,
    wikipediaVerified: row.wikipedia_verified,
    wikipediaCheckedNo: row.wikipedia_checked_no,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
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

// "current" = is_current=true (today's actual officeholder); "all" = every
// term ever, no filter (getSenateHistory/getHouseHistory below); "asOf" =
// whoever held the seat on a specific date — the home map's year-travel
// feature (UsMap.tsx/StatePanel.tsx), resolved from a selected election
// year to "${year+1}-01-03" (the day that Congress convened) one level up.
type TermScope = { kind: "current" } | { kind: "all" } | { kind: "asOf"; date: string };

// Typed off a real base query (rather than a loose structural interface)
// so TS can actually verify the .eq()/.lte()/.or() chain below — PostgREST's
// builder generics don't structurally match a hand-written interface.
function baseTermsQuery() {
  return supabase.from("terms").select(TERM_WITH_LEGISLATOR_SELECT);
}
type TermsQuery = ReturnType<typeof baseTermsQuery>;

function applyScope(query: TermsQuery, scope: TermScope): TermsQuery {
  if (scope.kind === "current") return query.eq("is_current", true);
  if (scope.kind === "asOf") {
    // end_date must be treated as EXCLUSIVE, not inclusive — confirmed live
    // that a continuously-serving member's consecutive terms share the
    // exact same boundary date (e.g. one term's end_date "2021-01-03" is
    // the very next term's start_date "2021-01-03", Congress terms having
    // no gap between them), so an inclusive `end_date >= asOfDate` matched
    // BOTH rows simultaneously for anyone re-elected — a guaranteed dupe on
    // every single asOf query at that boundary, not a rare edge case (hit
    // this via a real duplicate-React-key console error before this fix).
    return query.lte("start_date", scope.date).or(`end_date.is.null,end_date.gt.${scope.date}`);
  }
  return query;
}

async function getTerms(
  stateAbbr: string,
  chamber: Chamber,
  scope: TermScope,
): Promise<TermWithLegislator[]> {
  const query = applyScope(
    baseTermsQuery().eq("state_id", stateAbbr).eq("chamber", chamber),
    scope,
  );

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as TermRow[]).map(fromRow);
}

export async function getCurrentSenators(stateAbbr: string): Promise<TermWithLegislator[]> {
  return getTerms(stateAbbr, "senate", { kind: "current" });
}

/** Whoever held this state's Senate seats on `asOfDate` — see TermScope. */
export async function getSenatorsAsOf(
  stateAbbr: string,
  asOfDate: string,
): Promise<TermWithLegislator[]> {
  return getTerms(stateAbbr, "senate", { kind: "asOf", date: asOfDate });
}

const senatorsByStateCache = new Map<string, Promise<Map<string, TermWithLegislator[]>>>();

/**
 * Every state's senators (current, or as of a given date) in one query,
 * grouped by state — for src/lib/senate-split-geo.ts, which otherwise
 * would need one query per state (51 round trips) to build the map's
 * Senate layer. Cached per `asOfDate` (`null` = current) — switching the
 * home map's year dropdown back to an already-viewed year doesn't refetch.
 */
export function getSenatorsByStateMap(
  asOfDate: string | null,
): Promise<Map<string, TermWithLegislator[]>> {
  const key = asOfDate ?? "current";
  let cached = senatorsByStateCache.get(key);
  if (!cached) {
    cached = fetchSenatorsByStateMap(asOfDate);
    senatorsByStateCache.set(key, cached);
  }
  return cached;
}

async function fetchSenatorsByStateMap(
  asOfDate: string | null,
): Promise<Map<string, TermWithLegislator[]>> {
  const query = applyScope(
    baseTermsQuery().eq("chamber", "senate"),
    asOfDate === null ? { kind: "current" } : { kind: "asOf", date: asOfDate },
  );
  const { data, error } = await query;
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

/**
 * Party control tally for the whole Senate as of `asOfDate` (`null` =
 * current) — e.g. "53R–45D–2I" via party-colors.ts's formatPartyControl().
 * Reuses getSenatorsByStateMap's own cache, so this never triggers an
 * extra fetch — just re-derives the tally from data the map already has.
 */
export async function getSenatePartyTally(asOfDate: string | null): Promise<Map<string, number>> {
  const byState = await getSenatorsByStateMap(asOfDate);
  const parties: (string | null)[] = [];
  for (const senators of byState.values()) {
    for (const s of senators) parties.push(s.term.party);
  }
  return tallyPartyLetters(parties);
}

export async function getCurrentRepresentatives(
  stateAbbr: string,
): Promise<TermWithLegislator[]> {
  const terms = await getTerms(stateAbbr, "house", { kind: "current" });
  return terms.sort((a, b) => (a.term.district ?? 0) - (b.term.district ?? 0));
}

/** Whoever held this state's House seats on `asOfDate` — see TermScope. */
export async function getRepresentativesAsOf(
  stateAbbr: string,
  asOfDate: string,
): Promise<TermWithLegislator[]> {
  const terms = await getTerms(stateAbbr, "house", { kind: "asOf", date: asOfDate });
  return terms.sort((a, b) => (a.term.district ?? 0) - (b.term.district ?? 0));
}

/** All Senate terms ever held for a state (current + past), newest first. */
export async function getSenateHistory(stateAbbr: string): Promise<TermWithLegislator[]> {
  const terms = await getTerms(stateAbbr, "senate", { kind: "all" });
  return terms.sort((a, b) => b.term.startDate.localeCompare(a.term.startDate));
}

/**
 * All House terms ever held for a state (current + past), newest first —
 * a flat chronological list, not grouped by district. District lines have
 * been redrawn many times since 1789, so a "district group" isn't a stable
 * real-world seat the way Senate's fixed 2-per-state slots are.
 */
export async function getHouseHistory(stateAbbr: string): Promise<TermWithLegislator[]> {
  const terms = await getTerms(stateAbbr, "house", { kind: "all" });
  return terms.sort((a, b) => b.term.startDate.localeCompare(a.term.startDate));
}

const repsByDistrictKeyCache = new Map<string, Promise<Map<string, TermWithLegislator>>>();

/**
 * House member keyed by "STATE-DISTRICT" (e.g. "CA-12", "WY-0" for
 * at-large) — for joining onto district geometry (src/lib/districts-geo.ts,
 * always CURRENT/119th-Congress shapes regardless of `asOfDate` — see
 * UsMap.tsx's redistricting-disclaimer comment) so the map's district layer
 * can be colored/labeled by whoever held each seat on that date. `null` =
 * current. Cached per key like getSenatorsByStateMap above, for the same
 * reason (UsMap.tsx only fetches on the first switch to "Districts" mode
 * for a given year, but that can happen again after a remount).
 */
export function getRepsByDistrictKeyMap(
  asOfDate: string | null,
): Promise<Map<string, TermWithLegislator>> {
  const key = asOfDate ?? "current";
  let cached = repsByDistrictKeyCache.get(key);
  if (!cached) {
    cached = fetchRepsByDistrictKeyMap(asOfDate);
    repsByDistrictKeyCache.set(key, cached);
  }
  return cached;
}

async function fetchRepsByDistrictKeyMap(
  asOfDate: string | null,
): Promise<Map<string, TermWithLegislator>> {
  const query = applyScope(
    baseTermsQuery().eq("chamber", "house"),
    asOfDate === null ? { kind: "current" } : { kind: "asOf", date: asOfDate },
  );
  const { data, error } = await query;
  if (error) throw error;

  const map = new Map<string, TermWithLegislator>();
  for (const row of data as unknown as TermRow[]) {
    if (row.district_number === null) continue;
    map.set(`${row.state_id}-${row.district_number}`, fromRow(row));
  }
  return map;
}

/**
 * Party control tally for the whole House as of `asOfDate` — mirrors
 * getSenatePartyTally above, reusing getRepsByDistrictKeyMap's own cache.
 */
export async function getHousePartyTally(asOfDate: string | null): Promise<Map<string, number>> {
  const byDistrict = await getRepsByDistrictKeyMap(asOfDate);
  return tallyPartyLetters([...byDistrict.values()].map((r) => r.term.party));
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
