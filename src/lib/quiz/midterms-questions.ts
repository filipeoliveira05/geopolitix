import type { Race, RaceOffice } from "@/lib/races-data";
import { getStateName } from "@/lib/states";
import { pickRandom } from "./random";
import { buildMultipleChoiceQuestion } from "./build-multiple-choice";
import type { MultipleChoiceQuestion } from "./types";

export type CandidateFact = {
  name: string;
  party: string;
  isIncumbent: boolean;
  stateName: string;
  office: RaceOffice;
  districtNumber: number | null;
};

function isRealCandidateName(name: string): boolean {
  return name.trim().toUpperCase() !== "TBD" && !/\(presumptive\)/i.test(name);
}

/**
 * Flattens every race's candidates into one quiz-ready pool — skips placeholder candidates
 * (Wikipedia's "TBD"/"(presumptive)" convention for an unresolved primary, same check
 * races-data.ts's own isPrimaryPending uses at the race level, just applied per-candidate here)
 * and any candidate with no known party, since both question types below need a real name and a
 * real party to ask about.
 */
export function candidateFactsFromRaces(races: Race[]): CandidateFact[] {
  const facts: CandidateFact[] = [];
  for (const race of races) {
    const stateName = getStateName(race.stateId);
    if (!stateName) continue;
    for (const candidate of race.candidates) {
      if (!candidate.party || !isRealCandidateName(candidate.name)) continue;
      facts.push({
        name: candidate.name,
        party: candidate.party,
        isIncumbent: candidate.isIncumbent,
        stateName,
        office: race.office,
        districtNumber: race.districtNumber,
      });
    }
  }
  return facts;
}

/**
 * "Texas Senate" / "Texas Governor" / "Texas House" / "Texas House District 3" — the race an
 * incumbency question is asking about, so "Is X the incumbent in this race?" (previously
 * unanswerable — no race was ever named) actually names one.
 */
function raceLabel(stateName: string, office: RaceOffice, districtNumber: number | null): string {
  const officeLabel = office === "senate" ? "Senate" : office === "governor" ? "Governor" : "House";
  const district = office === "house" && districtNumber ? ` District ${districtNumber}` : "";
  return `${stateName} ${officeLabel}${district}`;
}

/**
 * "What party is X running as?" — multiple choice with only as many options as there are real
 * distinct party values in the pool (realistically 2, occasionally 3 — nowhere near the 4 a
 * normal quiz question needs), capped at 4 for consistency with every other category.
 */
export function buildCandidatePartyQuestions(
  facts: CandidateFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const distinctPartyCount = new Set(facts.map((f) => f.party)).size;
  const optionCount = Math.min(4, Math.max(2, distinctPartyCount));
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, facts, {
      getPrompt: (s) => `What party is ${s.name} running as?`,
      getOptionText: (f) => f.party,
      optionCount,
    }),
  );
}

/**
 * A plain Yes/No question — isIncumbent is already boolean, so there's no pool-based distractor
 * to pick; this doesn't go through buildMultipleChoiceQuestion at all.
 */
export function buildIncumbencyQuestions(
  facts: CandidateFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const subjects = pickRandom(facts, count);
  return subjects.map((s) => ({
    format: "multiple-choice",
    prompt: `Is ${s.name} the incumbent in the ${raceLabel(s.stateName, s.office, s.districtNumber)} race?`,
    imageUrl: null,
    options: ["Yes", "No"],
    correctIndex: s.isIncumbent ? 0 : 1,
  }));
}
