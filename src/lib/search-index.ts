import { supabase } from "./supabase";
import { getAllStates } from "./states";

// Powers the global search overlay (GlobalHeader/SearchOverlay) — a flat,
// client-side index of every page the app can send you to for a specific
// person or state, fetched once per session and matched entirely in the
// browser (Fuse.js) rather than re-queried per keystroke. See
// docs/superpowers/specs/2026-08-31-global-search-nav-design.md for why:
// "John Smith" as one query string can't `ilike` against split
// first_name/last_name columns without a SQL function, and the whole
// searchable population (~15,700 rows) is small enough to just hold in
// memory for the session.

export type SearchEntryType = "legislator" | "governor" | "candidate" | "state";

export type SearchEntry = {
  id: string;
  name: string;
  type: SearchEntryType;
  subtitle: string;
  href: string;
  photoUrl: string | null;
};

const PAGE_SIZE = 1000;

type RangeQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>;
};

// Same pattern as scripts/sync/*.mjs's own selectAllPages — PostgREST caps a
// single select() at 1000 rows, and `legislators` (~12,700 rows) and
// `governor_terms` (~2,400) both exceed that.
async function selectAllPages<T>(buildQuery: () => RangeQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ");
}

type LegislatorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};
type CurrentTermRow = { legislator_id: string; chamber: "house" | "senate"; state_id: string };

// Only current officeholders (~535 terms) get an accurate "Senator · TX"
// subtitle — getting the same for departed legislators would mean fetching
// all ~45k terms rows just for a subtitle string, which defeats the point
// of a light index. A generic subtitle still links to the right page,
// which is the actual goal (deliberate trade-off, see the design doc).
async function fetchLegislatorEntries(): Promise<SearchEntry[]> {
  const [legislators, currentTerms] = await Promise.all([
    selectAllPages<LegislatorRow>(() =>
      supabase.from("legislators").select("id, first_name, last_name, photo_url"),
    ),
    selectAllPages<CurrentTermRow>(() =>
      supabase.from("terms").select("legislator_id, chamber, state_id").eq("is_current", true),
    ),
  ]);
  const currentByLegislator = new Map(currentTerms.map((t) => [t.legislator_id, t]));

  return legislators
    .filter((l) => l.first_name || l.last_name)
    .map((l) => {
      const term = currentByLegislator.get(l.id);
      const subtitle = term
        ? `${term.chamber === "senate" ? "Senator" : "Representative"} · ${term.state_id}`
        : "Former member of Congress";
      return {
        id: l.id,
        name: fullName(l.first_name, l.last_name),
        type: "legislator" as const,
        subtitle,
        href: `/legislator/${l.id}`,
        photoUrl: l.photo_url,
      };
    });
}

type GovernorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  state_id: string;
  photo_url: string | null;
};
type GovernorTermRow = {
  wikidata_person_id: string;
  name: string;
  state_id: string;
  is_current: boolean;
  governor_id: string | null;
  photo_url: string | null;
};

// Mirrors getGovernor()'s own id resolution (governors-data.ts): a current
// officeholder present in `governors` links via governors.id, same as
// every other page in the app already does; the ~12 OpenStates-gap states'
// current governor and every non-current historical governor link via
// their wikidata_person_id instead — /governor/[id] already resolves both
// id shapes.
async function fetchGovernorEntries(): Promise<SearchEntry[]> {
  const [governors, terms] = await Promise.all([
    selectAllPages<GovernorRow>(() =>
      supabase.from("governors").select("id, first_name, last_name, state_id, photo_url"),
    ),
    selectAllPages<GovernorTermRow>(() =>
      supabase
        .from("governor_terms")
        .select("wikidata_person_id, name, state_id, is_current, governor_id, photo_url"),
    ),
  ]);

  const entries: SearchEntry[] = governors.map((g) => ({
    id: g.id,
    name: fullName(g.first_name, g.last_name),
    type: "governor",
    subtitle: `Governor · ${g.state_id}`,
    href: `/governor/${g.id}`,
    photoUrl: g.photo_url,
  }));

  // Distinct by wikidata_person_id — a person can have multiple term rows
  // (non-consecutive terms). Prefer a person's current-term row when they
  // have one, so `is_current`/`governor_id` reflect their latest status.
  const byPerson = new Map<string, GovernorTermRow>();
  for (const t of terms) {
    const existing = byPerson.get(t.wikidata_person_id);
    if (!existing || t.is_current) byPerson.set(t.wikidata_person_id, t);
  }
  for (const t of byPerson.values()) {
    if (t.is_current && t.governor_id) continue; // already covered via `governors` above
    entries.push({
      id: t.wikidata_person_id,
      name: t.name,
      type: "governor",
      subtitle: t.is_current ? `Governor · ${t.state_id}` : `Former Governor · ${t.state_id}`,
      href: `/governor/${t.wikidata_person_id}`,
      photoUrl: t.photo_url,
    });
  }
  return entries;
}

type CandidateRow = { id: string; name: string; state_id: string; photo_url: string | null };

async function fetchCandidateEntries(): Promise<SearchEntry[]> {
  const candidates = await selectAllPages<CandidateRow>(() =>
    supabase.from("candidates").select("id, name, state_id, photo_url"),
  );
  return candidates.map((c) => ({
    id: c.id,
    name: c.name,
    type: "candidate",
    subtitle: `Candidate · ${c.state_id}`,
    href: `/candidate/${c.id}`,
    photoUrl: c.photo_url,
  }));
}

// Free — getAllStates() is derived from the map's own local geometry data
// (us-atlas), no Supabase round trip needed. Flag URL follows the same
// predictable WPR pattern geography.mjs syncs from, so it needs no fetch
// either.
function buildStateEntries(): SearchEntry[] {
  return getAllStates().map((s) => ({
    id: s.abbr,
    name: s.name,
    type: "state" as const,
    subtitle: "State",
    href: `/state/${s.abbr}`,
    photoUrl: `https://worldpopulationreview.com/images/state-flags/w1280/${s.abbr.toLowerCase()}.png`,
  }));
}

export async function buildSearchIndex(): Promise<SearchEntry[]> {
  const [legislatorEntries, governorEntries, candidateEntries] = await Promise.all([
    fetchLegislatorEntries(),
    fetchGovernorEntries(),
    fetchCandidateEntries(),
  ]);
  return [...legislatorEntries, ...governorEntries, ...candidateEntries, ...buildStateEntries()];
}
