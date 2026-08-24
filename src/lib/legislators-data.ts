import legislatorsData from "@/data/legislators.json";

// Synced from unitedstates/congress-legislators via `npm run sync:legislators`
// (see scripts/sync/legislators.mjs) — stand-in for the Supabase
// `legislators`/`terms` tables (plan §4) until that sync job exists for real.

export type Chamber = "house" | "senate";

export type Legislator = {
  id: string;
  bioguideId: string;
  govtrackId: number | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string;
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
  endDate: string;
  isCurrent: boolean;
};

type LegislatorsFile = {
  source: string;
  generatedAt: string;
  legislators: Legislator[];
  terms: Term[];
};

const data = legislatorsData as LegislatorsFile;

const legislatorsById = new Map(data.legislators.map((l) => [l.id, l]));

export type CurrentMember = {
  legislator: Legislator;
  term: Term;
};

function getCurrentTerms(stateAbbr: string, chamber: Chamber): CurrentMember[] {
  return data.terms
    .filter(
      (t) => t.stateId === stateAbbr && t.chamber === chamber && t.isCurrent,
    )
    .map((term) => {
      const legislator = legislatorsById.get(term.legislatorId);
      if (!legislator) return null;
      return { legislator, term };
    })
    .filter((m): m is CurrentMember => m !== null);
}

export function getCurrentSenators(stateAbbr: string): CurrentMember[] {
  return getCurrentTerms(stateAbbr, "senate");
}

export function getCurrentRepresentatives(stateAbbr: string): CurrentMember[] {
  return getCurrentTerms(stateAbbr, "house").sort(
    (a, b) => (a.term.district ?? 0) - (b.term.district ?? 0),
  );
}

export function legislatorFullName(legislator: Legislator): string {
  return [legislator.firstName, legislator.lastName].filter(Boolean).join(" ");
}

export const legislatorsSyncedAt = data.generatedAt;
