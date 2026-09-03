import type { StateFact } from "@/lib/geography-data";
import { pickRandom } from "./random";
import { buildMultipleChoiceQuestion } from "./build-multiple-choice";
import type { MultipleChoiceQuestion, MapClickQuestion } from "./types";

export function buildCapitalQuestions(facts: StateFact[], count: number): MultipleChoiceQuestion[] {
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, facts, {
      getPrompt: (s) => `What is the capital of ${s.stateName}?`,
      getOptionText: (f) => f.capitalName,
    }),
  );
}

export function buildFlagQuestions(facts: StateFact[], count: number): MultipleChoiceQuestion[] {
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, facts, {
      getPrompt: () => "Which state does this flag belong to?",
      getOptionText: (f) => f.stateName,
      getImageUrl: (f) => f.flagUrl,
    }),
  );
}

export function buildMapClickQuestions(facts: StateFact[], count: number): MapClickQuestion[] {
  const subjects = pickRandom(facts, count);
  return subjects.map((s) => ({
    format: "map-click",
    prompt: `Click on ${s.stateName}.`,
    targetStateId: s.stateId,
    targetStateName: s.stateName,
  }));
}
