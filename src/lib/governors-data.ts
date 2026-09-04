import { supabase } from "./supabase";
import { getStateName } from "./states";

// Reads the Supabase `governors` table (plan §4), synced via
// `npm run sync:governors` (see scripts/sync/governors.mjs).

export type Governor = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  bioSummary: string | null;
  wikipediaTitle: string | null;
  wikipediaVerified: boolean;
  wikipediaCheckedNo: boolean;
  stateId: string;
  party: string | null;
  startDate: string | null;
  endDate: string | null;
  lastSyncedAt: Date | null;
};

type GovernorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  bio_summary: string | null;
  wikipedia_title: string | null;
  wikipedia_verified: boolean;
  wikipedia_checked_no: boolean;
  state_id: string;
  party: string | null;
  start_date: string | null;
  end_date: string | null;
  last_synced_at: string | null;
};

function fromRow(row: GovernorRow): Governor {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    photoUrl: row.photo_url,
    bioSummary: row.bio_summary,
    wikipediaTitle: row.wikipedia_title,
    wikipediaVerified: row.wikipedia_verified,
    wikipediaCheckedNo: row.wikipedia_checked_no,
    stateId: row.state_id,
    party: row.party,
    startDate: row.start_date,
    endDate: row.end_date,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
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

/**
 * Whoever held this state's governorship on `asOfDate` — the home map's
 * year-travel feature (UsMap.tsx/StatePanel.tsx via election-years.ts),
 * queried straight from governor_terms' full history (no `governors` table
 * fallback needed here, unlike getGovernor() above — governor_terms already
 * covers every state's whole history regardless of OpenStates coverage).
 *
 * `asOfDate` is the SAME date election-years.ts computes for Congress
 * ("${year+1}-01-03") — a reasonable approximation, not a guarantee, since
 * gubernatorial inaugurations vary by state and aren't all on that date
 * (unlike Congress, which reliably convenes Jan 3). A state whose actual
 * transition falls a few weeks later than Jan 3 could show the outgoing
 * governor for that narrow window — same class of accepted, documented
 * simplification as this app's other data-quality gaps (see CLAUDE.md).
 *
 * Uses `end_date` EXCLUSIVE (`> asOfDate`, not `>=`) for the identical
 * reason legislators-data.ts's applyScope() does — confirmed live that
 * `governor_terms` has the same back-to-back-terms boundary-date sharing.
 * Picks the latest-starting match defensively (not `.maybeSingle()`, which
 * would throw) since governor_terms' start/end dates have real, uneven
 * gaps (see governor-history.mjs's header comment) — a genuine overlap
 * shouldn't happen in clean data, but this degrades gracefully instead of
 * crashing the panel if one ever does.
 */
export async function getGovernorAsOf(
  stateAbbr: string,
  asOfDate: string,
): Promise<Governor | null> {
  const { data, error } = await supabase
    .from("governor_terms")
    .select("*")
    .eq("state_id", stateAbbr)
    .lte("start_date", asOfDate)
    .or(`end_date.is.null,end_date.gt.${asOfDate}`);
  if (error) throw error;

  const rows = data as unknown as GovernorTermRow[];
  if (rows.length === 0) return null;
  const best = rows.reduce((a, b) => ((b.start_date ?? "") > (a.start_date ?? "") ? b : a));
  return governorFromTerm(termFromRow(best));
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
  wikipediaTitle: string | null;
  wikipediaVerified: boolean;
  wikipediaCheckedNo: boolean;
  lastSyncedAt: Date | null;
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
  wikipedia_title: string | null;
  wikipedia_verified: boolean;
  wikipedia_checked_no: boolean;
  last_synced_at: string | null;
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
    wikipediaTitle: row.wikipedia_title,
    wikipediaVerified: row.wikipedia_verified,
    wikipediaCheckedNo: row.wikipedia_checked_no,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
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
    wikipediaTitle: term.wikipediaTitle,
    wikipediaVerified: term.wikipediaVerified,
    wikipediaCheckedNo: term.wikipediaCheckedNo,
    stateId: term.stateId,
    party: term.party,
    startDate: term.startDate,
    endDate: term.endDate,
    lastSyncedAt: term.lastSyncedAt,
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

export type GovernorFact = {
  stateId: string;
  stateName: string;
  governorName: string;
  photoUrl: string | null;
};

/**
 * Every state OpenStates actually has a current Governor entry for (38/50 — the OpenStates-gap
 * states have no row here at all, see this file's other comments) — powers the quiz's
 * Officeholders category. Deliberately doesn't fall back to governor_terms for the gap states
 * the way getGovernor() does for a single state's own page — that fallback needs a second query
 * per gap state, and the 38-state pool is already comfortably above the 4-subject minimum a
 * session needs, so it's not worth the extra complexity for v1.
 */
export async function getAllCurrentGovernors(): Promise<GovernorFact[]> {
  const { data, error } = await supabase
    .from("governors")
    .select("first_name, last_name, state_id, photo_url");
  if (error) throw error;
  return (
    data as {
      first_name: string | null;
      last_name: string | null;
      state_id: string;
      photo_url: string | null;
    }[]
  )
    .map((g): GovernorFact | null => {
      const stateName = getStateName(g.state_id);
      const governorName = [g.first_name, g.last_name].filter(Boolean).join(" ");
      if (!stateName || !governorName) return null;
      return { stateId: g.state_id, stateName, governorName, photoUrl: g.photo_url };
    })
    .filter((g): g is GovernorFact => g !== null);
}
