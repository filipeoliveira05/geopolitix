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
 * "Which state is this {senator/representative/governor} from?" — a governor's photo is folded
 * into the same pool a legislator's already was, rather than a separate near-duplicate question,
 * since the two only ever differed in which officeholder table the photo/name/party came from.
 * Governors with no synced photo (OpenStates only backfills ~76%) are silently excluded, same as
 * a legislator with no photo never enters getAllCurrentLegislatorsWithPhoto's pool.
 */
export function buildOfficeholderPhotoQuestions(
  legislators: LegislatorStateFact[],
  governors: GovernorFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const pool: OfficeholderPhotoFact[] = [
    ...legislators.map(legislatorToPhotoFact),
    ...governors.map(governorToPhotoFact).filter((f): f is OfficeholderPhotoFact => f !== null),
  ];
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
