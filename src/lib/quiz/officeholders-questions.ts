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
    }),
  );
}

export function buildLegislatorPhotoQuestions(
  facts: LegislatorStateFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, facts, {
      getPrompt: () => "Which state does this legislator represent?",
      getOptionText: (f) => f.stateName,
      getImageUrl: (f) => f.photoUrl,
    }),
  );
}
