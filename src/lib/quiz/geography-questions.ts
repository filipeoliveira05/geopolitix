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

/**
 * A plain Yes/No question, same shape as buildIncumbencyQuestions — isCapital is already
 * boolean, no pool-based distractor needed. For a random eligible state (one with both a
 * capital and at least one non-capital city synced), picks either the real capital (Yes) or a
 * random non-capital city (No), 50/50 — a uniform random city pick would skew heavily toward
 * "No" (~10 non-capitals synced per 1 capital per state). Shows the state's flag, same as
 * buildLargestCityQuestions, so the subject state is visually clear alongside the named city.
 */
export function buildIsCapitalQuestions(
  cities: CityFact[],
  states: StateFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const flagByState = new Map(states.map((s) => [s.stateId, s.flagUrl]));
  const citiesByState = new Map<string, CityFact[]>();
  for (const city of cities) {
    if (!citiesByState.has(city.stateId)) citiesByState.set(city.stateId, []);
    citiesByState.get(city.stateId)!.push(city);
  }
  const eligibleStates = Array.from(citiesByState.values()).filter(
    (list) =>
      list.some((c) => c.isCapital) &&
      list.some((c) => !c.isCapital) &&
      flagByState.has(list[0].stateId),
  );

  const subjects = pickRandom(eligibleStates, count);
  return subjects.map((stateCities) => {
    const capital = stateCities.find((c) => c.isCapital)!;
    const nonCapitals = stateCities.filter((c) => !c.isCapital);
    const city = Math.random() < 0.5 ? capital : pickRandom(nonCapitals, 1)[0];
    return {
      format: "multiple-choice",
      prompt: `Is ${city.cityName} the capital of ${city.stateName}?`,
      imageUrl: flagByState.get(city.stateId) ?? null,
      imageCaption: null,
      imageCaptionParty: undefined,
      revealImageUrl: null,
      revealCaption: null,
      optionsAreParties: false,
      options: ["Yes", "No"],
      correctIndex: city.isCapital ? 0 : 1,
    };
  });
}

type LargestCityFact = { cityName: string; stateName: string; flagUrl: string };

/**
 * Per state: the single max-population city (the correct answer) plus every OTHER synced city
 * in that same state (the distractor candidates) — so wrong options are real cities from the
 * same state, not another state's largest city, which is a much easier tell to spot.
 */
function largestCityPerState(
  cities: CityFact[],
  states: StateFact[],
): { fact: LargestCityFact; otherCityNames: string[] }[] {
  const flagByState = new Map(states.map((s) => [s.stateId, s.flagUrl]));
  const citiesByState = new Map<string, CityFact[]>();
  for (const city of cities) {
    if (!citiesByState.has(city.stateId)) citiesByState.set(city.stateId, []);
    citiesByState.get(city.stateId)!.push(city);
  }

  const result: { fact: LargestCityFact; otherCityNames: string[] }[] = [];
  for (const [stateId, cityList] of citiesByState) {
    const flagUrl = flagByState.get(stateId);
    const populated = cityList.filter((c) => c.population !== null);
    if (!flagUrl || populated.length === 0) continue;
    const largest = populated.reduce((a, b) => ((b.population as number) > (a.population as number) ? b : a));
    result.push({
      fact: { cityName: largest.cityName, stateName: largest.stateName, flagUrl },
      otherCityNames: cityList.filter((c) => c.cityId !== largest.cityId).map((c) => c.cityName),
    });
  }
  return result;
}

/**
 * "What is the largest city in X?" MC — distinct from the capital, since a state's capital and
 * its most populous city are often two different cities (e.g. Austin vs. Houston). Shows the
 * state's flag so the subject state is unambiguous even though it's also named in the prompt.
 * Skips a state with fewer than 3 other synced cities (can't fill 4 options from one state alone)
 * — never hit in practice, since every state has a top-10-cities list, but a real, not
 * hypothetical, guard given the pool is now per-state rather than nationwide.
 */
export function buildLargestCityQuestions(
  cities: CityFact[],
  states: StateFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const grouped = largestCityPerState(cities, states).filter((g) => g.otherCityNames.length >= 3);
  const subjects = pickRandom(grouped, count);
  return subjects.map(({ fact, otherCityNames }) => {
    const pool: LargestCityFact[] = [
      fact,
      ...otherCityNames.map((cityName) => ({ ...fact, cityName })),
    ];
    return buildMultipleChoiceQuestion(fact, pool, {
      getPrompt: (s) => `What is the largest city in ${s.stateName}?`,
      getOptionText: (f) => f.cityName,
      getImageUrl: (f) => f.flagUrl,
    });
  });
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
