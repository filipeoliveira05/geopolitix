// See docs/quiz-notes.md before adding a new question type or touching this file — full architecture and every category's question-type batch writeup lives there, not repeated here.

import type { StateFact, CityFact } from "@/lib/geography-data";
import { formatPopulation } from "@/lib/format";
import { getStateSilhouettePath } from "@/lib/state-silhouette-geo";
import { getStateNeighborAbbrs } from "@/lib/state-borders";
import {
  getBorderRegionMap,
  getNeighborsClockwiseFromNorth,
} from "@/lib/state-border-region-geo";
import { pickRandom } from "./random";
import { buildMultipleChoiceQuestion } from "./build-multiple-choice";
import type { MultipleChoiceQuestion, MapClickQuestion, SearchSelectQuestion } from "./types";

export function buildCapitalQuestions(facts: StateFact[], count: number): MultipleChoiceQuestion[] {
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, facts, {
      getPrompt: (s) => `What is the capital of ${s.stateName}?`,
      getOptionText: (f) => f.capitalName,
      // The state is already named in the prompt, so the flag is a supplementary illustration,
      // not the clue itself (unlike buildFlagQuestions, where showing the flag first IS the
      // question) — shown below the prompt rather than above it.
      getImageUrl: (s) => s.flagUrl,
      imageBelowPrompt: true,
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
 * "Which state does this silhouette belong to?" MC — the shape itself is computed client-side
 * from the same real state boundary geometry the interactive map renders (state-silhouette-geo.ts),
 * not a synced image, so any state with a resolvable name gets one for free. D.C. is explicitly
 * excluded, unlike every other Geography question type here — it's synthesized as a pseudo-state
 * elsewhere in this codebase (geography.mjs gives it a synthetic "Washington" capital so it passes
 * getAllStateCapitalsAndFlags' filter, unlike this generator's own initial assumption that it'd
 * be naturally absent), but its real shape is a small, nearly featureless quadrilateral — not much
 * of a silhouette to guess from, and not worth it as a same-tiny-shape distractor either.
 */
export function buildStateSilhouetteQuestions(
  facts: StateFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const eligible = facts.filter((f) => f.stateId !== "DC");
  const subjects = pickRandom(eligible, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, eligible, {
      getPrompt: () => "Which state is this?",
      getOptionText: (f) => f.stateName,
      getSilhouettePath: (f) => getStateSilhouettePath(f.stateId),
    }),
  );
}

/**
 * "Which of these states does NOT border X?" MC — shows the subject's silhouette (borders read
 * more naturally off a shape than a flag). Bypasses buildMultipleChoiceQuestion entirely (same
 * reasoning as buildIsCapitalQuestions/buildStatePopulationQuestions): the "correct" option here
 * isn't the subject's own attribute, it's a specifically chosen NON-neighbor, and the 3 "wrong"
 * options are specifically chosen REAL neighbors, not a generic distractor pool. Only states with
 * at least 3 real neighbors are eligible subjects (need 3 real borders to use as traps) — this
 * naturally excludes Alaska, Hawaii, Maine, Florida, Washington, South Carolina, and Rhode Island.
 * D.C. is excluded explicitly and completely (never a subject, and never an option for another
 * state's question either) — same blanket treatment as buildStateSilhouetteQuestions, reversed
 * from an earlier version of this generator that let D.C. through as a legitimate option since it
 * only has 2 real neighbors; the user asked for it gone from both border question types entirely.
 *
 * The single correct (non-bordering) option is deliberately a "near miss" — a neighbor-of-a-
 * neighbor, i.e. geographically close but not directly touching — rather than a fully random
 * state, which risks being trivially easy (e.g. "which doesn't border Montana: North Dakota,
 * South Dakota, Wyoming, Florida?" needs no border knowledge at all to answer). Falls back to a
 * fully random non-neighbor only on the rare subject with no second-degree candidates at all.
 */
export function buildStateNonBorderQuestions(
  allFacts: StateFact[],
  count: number,
): MultipleChoiceQuestion[] {
  // D.C. is excluded entirely from this question type — never a subject, never an option (trap
  // or correct answer) for another state's question either. Filtering it out of the row pool up
  // front is enough on its own: every candidate set below (eligible subjects, traps, near-miss/
  // fallback correct-answer pools) is built by filtering/mapping over `facts`, and a state that's
  // never a row in `facts` can never end up chosen from any of them.
  const facts = allFacts.filter((f) => f.stateId !== "DC");
  const nameByAbbr = new Map(facts.map((f) => [f.stateId, f.stateName]));
  const realNeighborAbbrs = (abbr: string) =>
    getStateNeighborAbbrs(abbr).filter((a) => a !== "DC");
  const eligible = facts.filter((f) => realNeighborAbbrs(f.stateId).length >= 3);
  const subjects = pickRandom(eligible, count);

  return subjects.map((subject) => {
    const neighborAbbrs = realNeighborAbbrs(subject.stateId);
    const neighborSet = new Set(neighborAbbrs);

    const secondDegree = new Set<string>();
    for (const n of neighborAbbrs) {
      for (const nn of realNeighborAbbrs(n)) {
        if (nn !== subject.stateId && !neighborSet.has(nn) && nameByAbbr.has(nn)) {
          secondDegree.add(nn);
        }
      }
    }

    const nearMissPool = facts.filter((f) => secondDegree.has(f.stateId));
    const fallbackPool = facts.filter(
      (f) => f.stateId !== subject.stateId && !neighborSet.has(f.stateId),
    );
    const correct = pickRandom(nearMissPool.length > 0 ? nearMissPool : fallbackPool, 1)[0];
    const traps = pickRandom(
      facts.filter((f) => neighborSet.has(f.stateId)),
      3,
    );
    const options = pickRandom([correct, ...traps], 4);

    return {
      format: "multiple-choice",
      prompt: `Which of these states does NOT border ${subject.stateName}?`,
      imageUrl: null,
      silhouettePath: getStateSilhouettePath(subject.stateId) ?? undefined,
      imageCaption: null,
      imageCaptionParty: undefined,
      revealImageUrl: null,
      revealCaption: null,
      optionsAreParties: false,
      options: options.map((f) => f.stateName),
      correctIndex: options.findIndex((f) => f.stateId === correct.stateId),
    };
  });
}

/**
 * "Name all the states that border X." — search-and-select over a nationwide state-name index
 * (entityType "state", a new shared search pool alongside the existing city/senator/team ones —
 * see search-select-index.ts's buildStateEntries). Shows the subject's silhouette, not its flag,
 * same reasoning as buildStateNonBorderQuestions above. Only Alaska/Hawaii are excluded for
 * having 0 real neighbors (an empty, nothing-to-search-for board) — every other state, including
 * 1-neighbor Maine, is a genuine question. D.C. is excluded entirely and explicitly, both as a
 * subject and as a target/map entry for Maryland or Virginia's own questions — same blanket
 * treatment as buildStateNonBorderQuestions above, reversed from an earlier version that
 * included it as a legitimate 2-state border; the user asked for it gone from both border
 * question types.
 *
 * Targets are ordered clockwise-from-north (state-border-region-geo.ts), not alphabetically —
 * alphabetical order leaks a hint as slots fill in (e.g. finding the 2nd and 4th of 4 targets
 * narrows the remaining letter range for the 3rd). revealBorderMap precomputes the post-answer
 * regional-map reveal (subject + every real neighbor fit into one shared coordinate space) —
 * found/missed coloring isn't baked in here, the view derives that from the answered result.
 */
export function buildStateBorderRecallQuestions(
  allFacts: StateFact[],
  count: number,
): SearchSelectQuestion[] {
  const facts = allFacts.filter((f) => f.stateId !== "DC");
  const nameByAbbr = new Map(facts.map((f) => [f.stateId, f.stateName]));
  const eligible = facts.filter(
    (f) => getStateNeighborAbbrs(f.stateId).filter((a) => a !== "DC").length >= 1,
  );
  const subjects = pickRandom(eligible, count);

  return subjects.map((subject) => {
    const targets = getNeighborsClockwiseFromNorth(subject.stateId)
      .map((abbr) => ({ id: abbr, label: nameByAbbr.get(abbr) }))
      .filter((t): t is { id: string; label: string } => t.label !== undefined);

    const regionMap = getBorderRegionMap(subject.stateId);

    return {
      format: "search-select",
      prompt: `Name all the states that border ${subject.stateName}.`,
      silhouettePath: getStateSilhouettePath(subject.stateId) ?? undefined,
      entityType: "state",
      targets,
      revealBorderMap: regionMap
        ? {
            subject: {
              label: regionMap.subject.name,
              path: regionMap.subject.path,
              labelX: regionMap.subject.labelX,
              labelY: regionMap.subject.labelY,
            },
            neighbors: regionMap.neighbors
              .filter((n) => n.abbr !== "DC")
              .map((n) => ({
                id: n.abbr,
                label: n.name,
                path: n.path,
                labelX: n.labelX,
                labelY: n.labelY,
              })),
          }
        : undefined,
    };
  });
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

/** Buckets a city pool by state — shared by every per-state Geography question type below. */
function groupCitiesByState(cities: CityFact[]): Map<string, CityFact[]> {
  const map = new Map<string, CityFact[]>();
  for (const city of cities) {
    if (!map.has(city.stateId)) map.set(city.stateId, []);
    map.get(city.stateId)!.push(city);
  }
  return map;
}

function flagUrlByState(states: StateFact[]): Map<string, string> {
  return new Map(states.map((s) => [s.stateId, s.flagUrl]));
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
  const flagByState = flagUrlByState(states);
  const citiesByState = groupCitiesByState(cities);
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

type LargestCityFact = {
  cityName: string;
  stateName: string;
  flagUrl: string;
  population: number | null;
};

/**
 * Per state: the single max-population city (the correct answer) plus every OTHER synced city
 * in that same state (the distractor candidates) — so wrong options are real cities from the
 * same state, not another state's largest city, which is a much easier tell to spot.
 */
function largestCityPerState(
  cities: CityFact[],
  states: StateFact[],
): { fact: LargestCityFact; otherCities: { cityName: string; population: number | null }[] }[] {
  const flagByState = flagUrlByState(states);
  const citiesByState = groupCitiesByState(cities);

  const result: {
    fact: LargestCityFact;
    otherCities: { cityName: string; population: number | null }[];
  }[] = [];
  for (const [stateId, cityList] of citiesByState) {
    const flagUrl = flagByState.get(stateId);
    const populated = cityList.filter((c) => c.population !== null);
    if (!flagUrl || populated.length === 0) continue;
    const largest = populated.reduce((a, b) => ((b.population as number) > (a.population as number) ? b : a));
    result.push({
      fact: {
        cityName: largest.cityName,
        stateName: largest.stateName,
        flagUrl,
        population: largest.population,
      },
      otherCities: cityList
        .filter((c) => c.cityId !== largest.cityId)
        .map((c) => ({ cityName: c.cityName, population: c.population })),
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
  const grouped = largestCityPerState(cities, states).filter((g) => g.otherCities.length >= 3);
  const subjects = pickRandom(grouped, count);
  return subjects.map(({ fact, otherCities }) => {
    const pool: LargestCityFact[] = [
      fact,
      ...otherCities.map((c) => ({ ...fact, cityName: c.cityName, population: c.population })),
    ];
    return buildMultipleChoiceQuestion(fact, pool, {
      getPrompt: (s) => `What is the largest city in ${s.stateName}?`,
      getOptionText: (f) => f.cityName,
      getImageUrl: (f) => f.flagUrl,
      // Same post-answer population reveal as the two population-comparison question types
      // (optionPopulations, rendered by MultipleChoiceQuestionView only once answered).
      getOptionPopulation: (f) => f.population,
    });
  });
}

/**
 * "Is X the largest city in Y?" Yes/No — for a random eligible state (one with a determinable
 * largest city and at least one other synced city), picks either the real largest city (Yes) or
 * a random other city (No), 50/50. Deliberately not phrased around the capital ("is X ALSO the
 * largest city") — that reads oddly when the capital itself is never named in the prompt, and
 * this phrasing works identically whether or not the picked city happens to be the capital.
 */
export function buildIsLargestCityQuestions(
  cities: CityFact[],
  states: StateFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const flagByState = flagUrlByState(states);
  const citiesByState = groupCitiesByState(cities);

  type Group = { largest: CityFact; others: CityFact[]; flagUrl: string };
  const eligible: Group[] = [];
  for (const [stateId, cityList] of citiesByState) {
    const flagUrl = flagByState.get(stateId);
    const populated = cityList.filter((c) => c.population !== null);
    if (!flagUrl || populated.length === 0) continue;
    const largest = populated.reduce((a, b) => ((b.population as number) > (a.population as number) ? b : a));
    const others = cityList.filter((c) => c.cityId !== largest.cityId);
    if (others.length === 0) continue;
    eligible.push({ largest, others, flagUrl });
  }

  return pickRandom(eligible, count).map(({ largest, others, flagUrl }) => {
    const city = Math.random() < 0.5 ? largest : pickRandom(others, 1)[0];
    const isLargest = city.cityId === largest.cityId;
    const revealText = isLargest
      ? `${city.cityName}: ${formatPopulation(city.population as number)} — the largest in ${city.stateName}.`
      : `${city.cityName}: ${formatPopulation(city.population as number)}.\nLargest: ${largest.cityName}, ${formatPopulation(largest.population as number)}.`;
    return {
      format: "multiple-choice",
      prompt: `Is ${city.cityName} the largest city in ${city.stateName}?`,
      imageUrl: flagUrl,
      imageCaption: null,
      imageCaptionParty: undefined,
      revealImageUrl: null,
      revealCaption: null,
      revealText,
      optionsAreParties: false,
      options: ["Yes", "No"],
      correctIndex: isLargest ? 0 : 1,
    };
  });
}

/**
 * "Which state has a higher population?" — a genuine two-way comparison, not a subject+pool
 * question, so this bypasses buildMultipleChoiceQuestion entirely (same reasoning as the Yes/No
 * generators above): the two options ARE the two states being compared, not a correct answer
 * plus unrelated distractors. The prompt stays generic since naming both states again would just
 * repeat what the two option buttons already show.
 */
export function buildStatePopulationQuestions(
  states: StateFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const populated = states.filter((s) => s.population !== null);
  const subjects = pickRandom(populated, count);
  return subjects.map((stateA) => {
    const others = populated.filter(
      (s) => s.stateId !== stateA.stateId && s.population !== stateA.population,
    );
    const stateB = pickRandom(others, 1)[0];
    const pair = pickRandom(
      [
        { label: stateA.stateName, population: stateA.population as number },
        { label: stateB.stateName, population: stateB.population as number },
      ],
      2,
    );
    const correctIndex = pair[0].population > pair[1].population ? 0 : 1;
    return {
      format: "multiple-choice",
      prompt: "Which state has a higher population?",
      imageUrl: null,
      imageCaption: null,
      imageCaptionParty: undefined,
      revealImageUrl: null,
      revealCaption: null,
      optionsAreParties: false,
      optionPopulations: pair.map((p) => p.population),
      options: pair.map((p) => p.label),
      correctIndex,
    };
  });
}

/**
 * "Which city has a higher population?" — same two-way-comparison shape as
 * buildStatePopulationQuestions, over the city pool instead. Each option is labeled
 * "{cityName}, {stateId}", not the bare city name — several city names repeat across different
 * states in the synced pool (e.g. multiple "Portland"s), and a bare name would make the two
 * options ambiguous or, worse, identical text for two different real cities.
 */
export function buildCityPopulationQuestions(
  cities: CityFact[],
  count: number,
): MultipleChoiceQuestion[] {
  const populated = cities.filter((c) => c.population !== null);
  const subjects = pickRandom(populated, count);
  return subjects.map((cityA) => {
    const others = populated.filter(
      (c) => c.cityId !== cityA.cityId && c.population !== cityA.population,
    );
    const cityB = pickRandom(others, 1)[0];
    const labelOf = (c: CityFact) => `${c.cityName}, ${c.stateId}`;
    const pair = pickRandom(
      [
        { label: labelOf(cityA), population: cityA.population as number },
        { label: labelOf(cityB), population: cityB.population as number },
      ],
      2,
    );
    const correctIndex = pair[0].population > pair[1].population ? 0 : 1;
    return {
      format: "multiple-choice",
      prompt: "Which city has a higher population?",
      imageUrl: null,
      imageCaption: null,
      imageCaptionParty: undefined,
      revealImageUrl: null,
      revealCaption: null,
      optionsAreParties: false,
      optionPopulations: pair.map((p) => p.population),
      options: pair.map((p) => p.label),
      correctIndex,
    };
  });
}

/**
 * "Name the top cities in {state}." — search-and-select format: the player searches for and
 * selects as many of the state's synced cities as they can find. targets sorted by population
 * descending (rank 1 = largest) so the finished board teaches the state's real city-size
 * ordering, same philosophy as this file's other population-reveal features. Every state with at
 * least one synced city is eligible — a single-city board is still a real question.
 */
export function buildCityRecallQuestions(
  cities: CityFact[],
  states: StateFact[],
  count: number,
): SearchSelectQuestion[] {
  const flagByState = flagUrlByState(states);
  const citiesByState = groupCitiesByState(cities);
  const eligible = Array.from(citiesByState.entries()).filter(([stateId]) =>
    flagByState.has(stateId),
  );
  const subjects = pickRandom(eligible, count);
  return subjects.map(([stateId, stateCities]) => {
    const sorted = [...stateCities].sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
    const stateName = stateCities[0].stateName;
    return {
      format: "search-select",
      prompt: `Name the top cities in ${stateName}.`,
      imageUrl: flagByState.get(stateId) as string,
      entityType: "city",
      targets: sorted.map((c) => ({ id: c.cityId, label: c.cityName })),
    };
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
