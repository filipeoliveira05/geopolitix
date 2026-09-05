// See docs/quiz-notes.md before adding a new question type or touching this file — full architecture and every category's question-type batch writeup lives there, not repeated here.

import type { GovernorFact } from "@/lib/governors-data";
import type { LegislatorStateFact, TermWithLegislator } from "@/lib/legislators-data";
import type { HouseSeatCountFact } from "@/lib/districts-data";
import type { StateFact } from "@/lib/geography-data";
import { pickRandom } from "./random";
import { buildMultipleChoiceQuestion } from "./build-multiple-choice";
import { fullLegislatorName } from "./search-select-index";
import type { MultipleChoiceQuestion, SearchSelectQuestion } from "./types";

export function buildGovernorQuestions(
  facts: GovernorFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, facts, {
      getPrompt: (s) => `Who is the current governor of ${s.stateName}?`,
      getOptionText: (f) => f.governorName,
      getRevealImageUrl: (s) => s.photoUrl,
      getRevealCaption: (s) => s.governorName,
    }),
  );
}

type OfficeholderPhotoFact = {
  name: string;
  party: string | null;
  roleLabel: "senator" | "representative" | "governor";
  photoUrl: string;
  stateId: string;
  stateName: string;
};

function legislatorToPhotoFact(f: LegislatorStateFact): OfficeholderPhotoFact {
  return {
    name: f.legislatorName,
    party: f.party,
    roleLabel: f.chamber === "senate" ? "senator" : "representative",
    photoUrl: f.photoUrl,
    stateId: f.stateId,
    stateName: f.stateName,
  };
}

function governorToPhotoFact(f: GovernorFact): OfficeholderPhotoFact | null {
  if (!f.photoUrl) return null;
  return {
    name: f.governorName,
    party: f.party,
    roleLabel: "governor",
    photoUrl: f.photoUrl,
    stateId: f.stateId,
    stateName: f.stateName,
  };
}

/**
 * Merges current legislators (Senate + House) and current governors into one pool — shared by
 * every "officeholder" question type below, so a governor's photo/name/party only ever needs
 * folding into the combined shape once. Governors with no synced photo (OpenStates only
 * backfills ~76%) are silently excluded, same as a legislator with no photo never enters
 * getAllCurrentLegislatorsWithPhoto's pool.
 */
function buildOfficeholderPool(
  legislators: LegislatorStateFact[],
  governors: GovernorFact[],
): OfficeholderPhotoFact[] {
  return [
    ...legislators.map(legislatorToPhotoFact),
    ...governors.map(governorToPhotoFact).filter((f): f is OfficeholderPhotoFact => f !== null),
  ];
}

/**
 * "Which state is this {senator/representative/governor} from?" — a governor's photo is folded
 * into the same pool a legislator's already was, rather than a separate near-duplicate question,
 * since the two only ever differed in which officeholder table the photo/name/party came from.
 */
export function buildOfficeholderPhotoQuestions(
  legislators: LegislatorStateFact[],
  governors: GovernorFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const pool = buildOfficeholderPool(legislators, governors);
  const subjects = pickRandom(pool, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, pool, {
      getPrompt: (s) => `Which state is this ${s.roleLabel} from?`,
      getOptionText: (f) => f.stateName,
      getImageUrl: (f) => f.photoUrl,
      getImageCaption: (f) => f.name,
      getImageCaptionParty: (f) => f.party,
    }),
  );
}

/** "Governor {name} of {state}" / "Senator {name} of {state}" / "Representative {name} of {state}". */
function officeholderLabel(f: OfficeholderPhotoFact): string {
  const noun = f.roleLabel === "senator" ? "Senator" : f.roleLabel === "representative" ? "Representative" : "Governor";
  return `${noun} ${f.name} of ${f.stateName}`;
}

/**
 * "What party is {officeholder}?" — same combined senator/representative/governor pool as the
 * state-guess question above, but only as many options as there are real distinct party values
 * in the pool (realistically 2-3), same reasoning buildCandidatePartyQuestions already uses.
 * Excludes any officeholder with no known party (a small handful of governor rows) — this
 * question needs a real answer to ask about, same filter reasoning candidateFactsFromRaces uses.
 */
export function buildOfficeholderPartyQuestions(
  legislators: LegislatorStateFact[],
  governors: GovernorFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const pool = buildOfficeholderPool(legislators, governors).filter((f) => f.party !== null);
  const distinctPartyCount = new Set(pool.map((f) => f.party)).size;
  const optionCount = Math.min(4, Math.max(2, distinctPartyCount));
  const subjects = pickRandom(pool, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, pool, {
      getPrompt: (s) => `What party is ${officeholderLabel(s)}?`,
      getOptionText: (f) => f.party as string,
      // Shown immediately — the name/state are already in the prompt, so there's nothing left
      // to spoil. No party badge on the caption, unlike the state-guess question above — that
      // WOULD give away the answer here.
      getImageUrl: (f) => f.photoUrl,
      getImageCaption: (f) => f.name,
      optionsAreParties: true,
      optionCount,
    }),
  );
}

/**
 * The minimum number of distinct same-state distractor names needed to keep a name-guess
 * question's 4 options entirely within the subject's own state — one less than the default
 * option count, since the subject's own name doesn't count as a distractor.
 */
const SAME_STATE_DISTRACTOR_MINIMUM = 3;

/**
 * "This is the governor of {state}." (unique — a state has exactly one) vs. "This is one of the
 * U.S. Senators from {state}." / "This is one of {state}'s U.S. Representatives." — a state has
 * TWO senators and (almost always) multiple representatives, so "the senator/representative from
 * X" would falsely imply there's only one; caught from live user feedback before this shipped.
 */
function nameCluePrompt(f: OfficeholderPhotoFact): string {
  if (f.roleLabel === "governor") return `This is the governor of ${f.stateName}. Who is it?`;
  if (f.roleLabel === "senator") return `This is one of the U.S. Senators from ${f.stateName}. Who is it?`;
  return `This is one of ${f.stateName}'s U.S. Representatives. Who is it?`;
}

/**
 * Combines the photo AND the state as clues (rather than a bare photo-only guess, which teaches
 * little beyond face-recognition) to guess the specific person's name — see nameCluePrompt above
 * for the exact wording per role. Distractors are drawn from the SAME state first, when that
 * state has at least 3 other distinct officeholders in the pool (its other senator, its governor,
 * another House delegation member) — this is what makes the state clue actually load-bearing: a
 * wrong guess has to be someone who could plausibly hold this exact office in this exact state,
 * not just any nationwide name. Falls back to the full nationwide pool for a state that doesn't
 * have 3 other officeholders to draw from (e.g. a lone at-large House seat plus a same-party
 * Senate pair).
 */
export function buildOfficeholderNameQuestions(
  legislators: LegislatorStateFact[],
  governors: GovernorFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const pool = buildOfficeholderPool(legislators, governors);
  const subjects = pickRandom(pool, count);
  return subjects.map((subject) => {
    const sameState = pool.filter((f) => f.stateId === subject.stateId && f.name !== subject.name);
    const distinctSameStateNames = new Set(sameState.map((f) => f.name)).size;
    const distractorPool =
      distinctSameStateNames >= SAME_STATE_DISTRACTOR_MINIMUM ? [subject, ...sameState] : pool;
    return buildMultipleChoiceQuestion(subject, distractorPool, {
      getPrompt: nameCluePrompt,
      getOptionText: (f) => f.name,
      getImageUrl: (f) => f.photoUrl,
    });
  });
}

/**
 * "Which chamber of Congress does this legislator serve in?" — legislators only, not governors
 * (a governor has no chamber to guess). Only 2 possible values nationwide, so optionCount is 2,
 * same "fewer than the default 4 when the real answer space is smaller" reasoning the party
 * question above already uses. Photo/name/party caption is safe to show up front — none of it
 * hints at chamber the way it would spoil the party question.
 */
export function buildChamberQuestions(
  facts: LegislatorStateFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, facts, {
      getPrompt: () => "Which chamber of Congress does this legislator serve in?",
      getOptionText: (f) => (f.chamber === "senate" ? "U.S. Senate" : "U.S. House of Representatives"),
      getImageUrl: (f) => f.photoUrl,
      getImageCaption: (f) => f.legislatorName,
      getImageCaptionParty: (f) => f.party,
      optionCount: 2,
    }),
  );
}

/**
 * "How many U.S. House seats does {state} have?" — text-only (a seat count has no photo). Options
 * are plain seat-count numbers, deduped like every other MC question, so a distractor is never
 * the subject's own real count even when several other states happen to share it (small states
 * cluster heavily around 1).
 */
export function buildHouseSeatCountQuestions(
  facts: HouseSeatCountFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, facts, {
      getPrompt: (s) => `How many U.S. House seats does ${s.stateName} have?`,
      getOptionText: (f) => String(f.seatCount),
    }),
  );
}

/**
 * "Name {state}'s current U.S. Senators." — search-and-select format. Reuses
 * getSenatorsByStateMap(null) (legislators-data.ts), already built for senate-split-geo.ts's own
 * per-state grouping — no new query. targets.length is naturally 1-2 (2 ordinarily, 1 during a
 * rare vacancy); sorted alphabetically by full name since there's no other natural ordering for
 * two senators from the same state.
 */
export function buildSenatorRecallQuestions(
  senatorsByState: Map<string, TermWithLegislator[]>,
  states: StateFact[],
  count: number,
): SearchSelectQuestion[] {
  const flagByState = new Map(states.map((s) => [s.stateId, s.flagUrl]));
  const stateNameById = new Map(states.map((s) => [s.stateId, s.stateName]));
  const eligible = Array.from(senatorsByState.entries()).filter(
    ([stateId, senators]) => senators.length > 0 && flagByState.has(stateId),
  );
  const subjects = pickRandom(eligible, count);
  return subjects.map(([stateId, senators]) => {
    const stateName = stateNameById.get(stateId) as string;
    const sorted = [...senators].sort((a, b) =>
      fullLegislatorName(a.legislator).localeCompare(fullLegislatorName(b.legislator)),
    );
    return {
      format: "search-select",
      prompt: `Name ${stateName}'s current U.S. Senators.`,
      imageUrl: flagByState.get(stateId) as string,
      entityType: "senator",
      targets: sorted.map((s) => ({ id: s.legislator.id, label: fullLegislatorName(s.legislator) })),
    };
  });
}
