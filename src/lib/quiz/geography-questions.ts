import type { StateFact, CityFact } from "@/lib/geography-data";
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

/**
 * Name-to-abbreviation MC, randomized per question so both directions ("What is the
 * abbreviation for X?" and "Which state has the abbreviation Y?") show up across a session.
 * Needs no new data — StateFact.stateId already holds the USPS abbreviation.
 */
export function buildAbbreviationQuestions(
  facts: StateFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) => {
    const askForAbbreviation = Math.random() < 0.5;
    return buildMultipleChoiceQuestion(subject, facts, {
      getPrompt: (s) =>
        askForAbbreviation
          ? `What is the 2-letter abbreviation for ${s.stateName}?`
          : `Which state has the abbreviation "${s.stateId}"?`,
      getOptionText: (f) => (askForAbbreviation ? f.stateId : f.stateName),
    });
  });
}

/**
 * "Which state is this city in?" MC — distractor state names are drawn from the same city pool
 * (deduped by buildMultipleChoiceQuestion's own text-based dedup), so no separate states pool is
 * needed even though a state can appear as the correct answer for several different cities.
 */
export function buildCityStateQuestions(
  cities: CityFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const subjects = pickRandom(cities, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, cities, {
      getPrompt: (c) => `Which state is ${c.cityName} in?`,
      getOptionText: (c) => c.stateName,
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
