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

export type TermWithLegislator = {
  legislator: Legislator;
  term: Term;
};

function getTerms(
  stateAbbr: string,
  chamber: Chamber,
  { currentOnly }: { currentOnly: boolean },
): TermWithLegislator[] {
  return data.terms
    .filter(
      (t) =>
        t.stateId === stateAbbr &&
        t.chamber === chamber &&
        (!currentOnly || t.isCurrent),
    )
    .map((term) => {
      const legislator = legislatorsById.get(term.legislatorId);
      if (!legislator) return null;
      return { legislator, term };
    })
    .filter((m): m is TermWithLegislator => m !== null);
}

export function getCurrentSenators(stateAbbr: string): TermWithLegislator[] {
  return getTerms(stateAbbr, "senate", { currentOnly: true });
}

export function getCurrentRepresentatives(stateAbbr: string): TermWithLegislator[] {
  return getTerms(stateAbbr, "house", { currentOnly: true }).sort(
    (a, b) => (a.term.district ?? 0) - (b.term.district ?? 0),
  );
}

/**
 * All Senate terms ever held for a state (current + past), newest first.
 * The plan's History tab (§5) only calls for senators/governors over time —
 * House history isn't in scope there, so no equivalent getter for the House.
 */
export function getSenateHistory(stateAbbr: string): TermWithLegislator[] {
  return getTerms(stateAbbr, "senate", { currentOnly: false }).sort((a, b) =>
    b.term.startDate.localeCompare(a.term.startDate),
  );
}

export function legislatorFullName(legislator: Legislator): string {
  return [legislator.firstName, legislator.lastName].filter(Boolean).join(" ");
}

export const legislatorsSyncedAt = data.generatedAt;
