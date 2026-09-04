import type { GovernorFact } from "@/lib/governors-data";
import type { LegislatorStateFact } from "@/lib/legislators-data";
import { pickRandom } from "./random";
import { buildMultipleChoiceQuestion } from "./build-multiple-choice";
import type { MultipleChoiceQuestion } from "./types";

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
