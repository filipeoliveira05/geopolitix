import { supabase } from "./supabase";

// Reads the Supabase `governors` table (plan §4), synced via
// `npm run sync:governors` (see scripts/sync/governors.mjs).

export type Governor = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  bioSummary: string | null;
  wikipediaVerified: boolean;
  wikipediaCheckedNo: boolean;
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
  wikipedia_verified: boolean;
  wikipedia_checked_no: boolean;
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
    wikipediaVerified: row.wikipedia_verified,
    wikipediaCheckedNo: row.wikipedia_checked_no,
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

/**
 * OpenStates (the `governors` table's source) genuinely has no Governor
 * entry for a handful of states despite one existing (confirmed live: CA,
 * NJ, VA, and others) — a crowdsourced-data gap, not a bug. Rather than a
 * hand-maintained override list (the previous approach — removed once it
 * went stale the moment one of those governors left office, confirmed
 * live for NJ/VA in Jan 2026), falls back to `governor_terms`' current-term
 * row, which governor-history.mjs already syncs from Wikidata for every
 * state regardless of OpenStates coverage. Uses the term's
 * `wikidata_person_id` as this Governor's `id` — /governor/[id]'s existing
 * fallback (treating an unrecognized id as a historical governor's
 * Wikidata id) already resolves that correctly, no route changes needed.
 */
export async function getGovernor(stateAbbr: string): Promise<Governor | null> {
  const { data, error } = await supabase
    .from("governors")
    .select("*")
    .eq("state_id", stateAbbr)
    .maybeSingle();
  if (error) throw error;
  if (data) return fromRow(data as unknown as GovernorRow);

  const { data: term, error: termError } = await supabase
    .from("governor_terms")
    .select("*")
    .eq("state_id", stateAbbr)
    .eq("is_current", true)
    .maybeSingle();
  if (termError) throw termError;
  if (!term) return null;
  return governorFromTerm(termFromRow(term as unknown as GovernorTermRow));
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
  // Per-person facts (identical across a person's own multiple term rows,
  // if any), from the Wikipedia REST API — not Wikidata's own P18/description,
  // which read noticeably thinner. governor-history.mjs's
  // copyCurrentBiosToGovernors() also copies these onto the matching
  // `governors` row for a current officeholder, so Governor.photoUrl/
  // bioSummary end up with the same values, not a separate OpenStates source.
  photoUrl: string | null;
  bioSummary: string | null;
  wikipediaVerified: boolean;
  wikipediaCheckedNo: boolean;
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
  photo_url: string | null;
  bio_summary: string | null;
  wikipedia_verified: boolean;
  wikipedia_checked_no: boolean;
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
    photoUrl: row.photo_url,
    bioSummary: row.bio_summary,
    wikipediaVerified: row.wikipedia_verified,
    wikipediaCheckedNo: row.wikipedia_checked_no,
  };
}

/** Shapes a governor_terms current-term row as a Governor — see getGovernor()'s fallback. */
function governorFromTerm(term: GovernorTerm): Governor {
  const [firstName, ...rest] = term.name.split(" ");
  return {
    id: term.wikidataPersonId,
    firstName,
    lastName: rest.join(" "),
    photoUrl: term.photoUrl,
    bioSummary: term.bioSummary,
    wikipediaVerified: term.wikipediaVerified,
    wikipediaCheckedNo: term.wikipediaCheckedNo,
    stateId: term.stateId,
    party: term.party,
    startDate: term.startDate,
    endDate: term.endDate,
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

/**
 * Every term served by one person, looked up directly by their
 * `wikidata_person_id` — for /governor/[id] when `id` isn't a current
 * `governors.id` (getGovernorById returns null), so the route falls back to
 * treating it as a historical governor's Wikidata id instead. Unlike
 * getTermsForGovernor, doesn't need a state up front (queries across all
 * states) since the caller doesn't know which one yet at this point.
 */
export async function getTermsForPerson(wikidataPersonId: string): Promise<GovernorTerm[]> {
  const { data, error } = await supabase
    .from("governor_terms")
    .select("*")
    .eq("wikidata_person_id", wikidataPersonId);
  if (error) throw error;
  return (data as unknown as GovernorTermRow[])
    .map(termFromRow)
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
}
