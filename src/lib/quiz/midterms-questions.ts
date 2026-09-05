// See docs/quiz-notes.md before adding a new question type or touching this file — full architecture and every category's question-type batch writeup lives there, not repeated here.

import type { Race, RaceOffice } from "@/lib/races-data";
import type { StateFact } from "@/lib/geography-data";
import { getStateName } from "@/lib/states";
import { pickRandom } from "./random";
import { buildMultipleChoiceQuestion } from "./build-multiple-choice";
import type { MultipleChoiceQuestion, SearchSelectQuestion } from "./types";

export type CandidateFact = {
  name: string;
  party: string;
  isIncumbent: boolean;
  stateName: string;
  office: RaceOffice;
  districtNumber: number | null;
  photoUrl: string | null;
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
        photoUrl: candidate.photoUrl,
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
      getPrompt: (s) =>
        `What party is ${s.name} running as in the ${raceLabel(s.stateName, s.office, s.districtNumber)} race?`,
      getOptionText: (f) => f.party,
      // Shown immediately, not gated behind answering — unlike the governor question's reveal,
      // the photo doesn't spoil anything here (the candidate's name is already in the prompt),
      // so there's no reason to delay it. No party badge on the caption — that WOULD spoil this
      // specific question, unlike the plain name/photo caption on the Legislator question.
      getImageUrl: (s) => s.photoUrl,
      getImageCaption: (s) => s.name,
      optionsAreParties: true,
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
    imageUrl: s.photoUrl,
    imageCaption: s.name,
    // Unlike the party question, incumbency isn't derivable from a party badge — safe to show,
    // same as the Legislator question's caption.
    imageCaptionParty: s.party,
    options: ["Yes", "No"],
    correctIndex: s.isIncumbent ? 0 : 1,
  }));
}

const CANDIDATE_SEARCH_POOL_SAMPLE_SIZE = 20;

/**
 * "Name every candidate running for {office} in {state}." — search-and-select format, one
 * specific Senate or Governor race per question (races is already Senate/Governor-only via
 * getSenateAndGovernorRaces — House stays excluded, same existing scope decision every other
 * Midterms question type follows). Eligible races need at least one real (non-placeholder)
 * candidate, same isRealCandidateName check candidateFactsFromRaces already applies per-candidate.
 * targets sorted alphabetically — no other natural ordering exists for a list of candidates.
 * searchPool carries the question's own targets plus a sample of real candidates from OTHER races
 * in the pool, since a candidate's relevance is scoped to one race — a nationwide candidate index
 * would be both expensive and mostly irrelevant as wrong-guess material.
 */
export function buildRaceCandidateRecallQuestions(
  races: Race[],
  states: StateFact[],
  count: number,
): SearchSelectQuestion[] {
  const flagByState = new Map(states.map((s) => [s.stateId, s.flagUrl]));
  const stateNameById = new Map(states.map((s) => [s.stateId, s.stateName]));
  const withRealCandidates = races.map((race) => ({
    race,
    realCandidates: race.candidates.filter((c) => isRealCandidateName(c.name)),
  }));
  const eligible = withRealCandidates.filter(
    ({ race, realCandidates }) => realCandidates.length > 0 && flagByState.has(race.stateId),
  );
  const subjects = pickRandom(eligible, count);
  return subjects.map(({ race, realCandidates }) => {
    const stateName = stateNameById.get(race.stateId) as string;
    const sorted = [...realCandidates].sort((a, b) => a.name.localeCompare(b.name));
    const targets = sorted.map((c) => ({ id: c.id, label: c.name, party: c.party }));
    const nearby = withRealCandidates
      .filter(({ race: otherRace }) => otherRace.id !== race.id)
      .flatMap(({ realCandidates: others }) => others)
      .slice(0, CANDIDATE_SEARCH_POOL_SAMPLE_SIZE)
      .map((c) => ({ id: c.id, label: c.name, party: c.party }));
    const officeLabel: string = race.office === "senate" ? "Senate" : "Governor";
    return {
      format: "search-select",
      prompt: `Name every candidate running for ${officeLabel} in ${stateName}.`,
      imageUrl: flagByState.get(race.stateId) as string,
      entityType: "candidate",
      targets,
      searchPool: [...targets, ...nearby],
    };
  });
}
