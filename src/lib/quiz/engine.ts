import {
  getAllStateCapitalsAndFlags,
  getAllCitiesWithState,
  getAllSportsTeams,
  type StateFact,
  type CityFact,
  type SportsTeam,
} from "@/lib/geography-data";
import { getAllCurrentGovernors, type GovernorFact } from "@/lib/governors-data";
import { getAllCurrentLegislatorsWithPhoto, type LegislatorStateFact } from "@/lib/legislators-data";
import { getHouseSeatCountsByState, type HouseSeatCountFact } from "@/lib/districts-data";
import { getSenateAndGovernorRaces } from "@/lib/races-data";
import {
  buildCapitalQuestions,
  buildFlagQuestions,
  buildMapClickQuestions,
  buildAbbreviationQuestions,
  buildCityStateQuestions,
  buildLargestCityQuestions,
  buildIsCapitalQuestions,
  buildIsLargestCityQuestions,
  buildStatePopulationQuestions,
  buildCityPopulationQuestions,
} from "./geography-questions";
import {
  buildGovernorQuestions,
  buildOfficeholderPhotoQuestions,
  buildOfficeholderPartyQuestions,
  buildOfficeholderNameQuestions,
  buildChamberQuestions,
  buildHouseSeatCountQuestions,
} from "./officeholders-questions";
import {
  candidateFactsFromRaces,
  buildCandidatePartyQuestions,
  buildIncumbencyQuestions,
  type CandidateFact,
} from "./midterms-questions";
import {
  buildTeamLogoQuestions,
  buildTeamStateQuestions,
  buildMatchingPairs,
} from "./sports-questions";
import { countOddOneOutEligibleStates, buildOddOneOutQuestions } from "./mashups-questions";
import { pickRandom, randomSplit } from "./random";
import type { QuizCategoryId } from "./category-config";
import type { QuizQuestion, MultipleChoiceQuestion, MatchingPair } from "./types";

export const SESSION_LENGTH = 10;
export const MATCHING_PAIR_COUNT = 6;
const SPEED_ROUND_PER_GENERATOR = 5;

type GeographyPool = { states: StateFact[]; cities: CityFact[] };
type OfficeholdersPool = {
  governors: GovernorFact[];
  legislatorsWithPhoto: LegislatorStateFact[];
  houseSeatCounts: HouseSeatCountFact[];
};
type MidtermsPool = { candidates: CandidateFact[] };
type MashupsPool = {
  geography: GeographyPool;
  officeholders: OfficeholdersPool;
  midterms: MidtermsPool;
  sports: SportsTeam[];
};

/**
 * Fetches a category's full data pool — used both to check "is there enough data to play" (see
 * getCategoryPoolSize below) and, once Start is pressed, to build the actual session (or, for a
 * category with a matching/speed-round mode, that mode's own board/pool — see
 * buildMatchingBoard/buildSpeedRoundPool). One fetch per category-page visit (cached by the
 * caller's TanStack Query key), never re-fetched per question. Mashups fetches every other
 * category's own pool up front (not just Sports, which its 10-question round alone needs) so its
 * speed-round mode can start instantly with zero additional fetches once the page has loaded.
 */
export async function fetchCategoryPool(category: QuizCategoryId): Promise<unknown> {
  switch (category) {
    case "geography": {
      const [states, cities] = await Promise.all([
        getAllStateCapitalsAndFlags(),
        getAllCitiesWithState(),
      ]);
      const pool: GeographyPool = { states, cities };
      return pool;
    }
    case "officeholders": {
      const [governors, legislatorsWithPhoto, houseSeatCounts] = await Promise.all([
        getAllCurrentGovernors(),
        getAllCurrentLegislatorsWithPhoto(),
        getHouseSeatCountsByState(),
      ]);
      const pool: OfficeholdersPool = { governors, legislatorsWithPhoto, houseSeatCounts };
      return pool;
    }
    case "midterms": {
      const races = await getSenateAndGovernorRaces();
      const pool: MidtermsPool = { candidates: candidateFactsFromRaces(races) };
      return pool;
    }
    case "sports":
      return getAllSportsTeams();
    case "mashups": {
      const [states, cities, governors, legislatorsWithPhoto, houseSeatCounts, races, sports] =
        await Promise.all([
          getAllStateCapitalsAndFlags(),
          getAllCitiesWithState(),
          getAllCurrentGovernors(),
          getAllCurrentLegislatorsWithPhoto(),
          getHouseSeatCountsByState(),
          getSenateAndGovernorRaces(),
          getAllSportsTeams(),
        ]);
      const pool: MashupsPool = {
        geography: { states, cities },
        officeholders: { governors, legislatorsWithPhoto, houseSeatCounts },
        midterms: { candidates: candidateFactsFromRaces(races) },
        sports,
      };
      return pool;
    }
    default:
      return [];
  }
}

/**
 * How many distinct playable subjects a category's pool actually has — used by QuizStartScreen
 * to gate the Start button. For Officeholders (two independent question types, each needing its
 * own minimum) this is the SMALLER of the two pools, since a session draws from both. For
 * Mashups this is how many states have enough pro teams for an odd-one-out question — NOT a raw
 * team count, since that's the actual constraint buildOddOneOutQuestions is subject to.
 */
export function getCategoryPoolSize(category: QuizCategoryId, pool: unknown): number {
  switch (category) {
    case "geography": {
      const { states, cities } = pool as GeographyPool;
      return Math.min(states.length, cities.length);
    }
    case "officeholders": {
      const { governors, legislatorsWithPhoto, houseSeatCounts } = pool as OfficeholdersPool;
      return Math.min(governors.length, legislatorsWithPhoto.length, houseSeatCounts.length);
    }
    case "midterms":
      return (pool as MidtermsPool).candidates.length;
    case "sports":
      return (pool as SportsTeam[]).length;
    case "mashups":
      return countOddOneOutEligibleStates((pool as MashupsPool).sports);
    default:
      return 0;
  }
}

/**
 * Turns an already-fetched pool into one session's worth of questions. `pool` must be exactly
 * what `fetchCategoryPool` returned for this same category — each switch branch casts it back to
 * the concrete shape its generators expect.
 *
 * Each question type's count is randomized per session via `randomSplit` (not a fixed
 * even/thirds division), and the combined result is shuffled (`pickRandom(qs, qs.length)`, the
 * same full-shuffle idiom `buildSpeedRoundPool` already used below) — otherwise every session
 * showed its question types in the same fixed blocks in the same order (e.g. Geography always
 * ran all its capital questions, then all its flag questions, then all its map-click questions),
 * which reads as an obviously hardcoded pattern to a repeat player and won't scale as more
 * question types get added per category.
 */
export function buildCategorySession(category: QuizCategoryId, pool: unknown): QuizQuestion[] {
  switch (category) {
    case "geography": {
      const { states: facts, cities } = pool as GeographyPool;
      const [
        capitalCount,
        flagCount,
        mapClickCount,
        abbreviationCount,
        cityStateCount,
        largestCityCount,
        isCapitalCount,
        isLargestCityCount,
        statePopulationCount,
        cityPopulationCount,
      ] = randomSplit(SESSION_LENGTH, 10);
      const questions: QuizQuestion[] = [
        ...buildCapitalQuestions(facts, capitalCount),
        ...buildFlagQuestions(facts, flagCount),
        ...buildMapClickQuestions(facts, mapClickCount),
        ...buildAbbreviationQuestions(facts, abbreviationCount),
        ...buildCityStateQuestions(cities, cityStateCount),
        ...buildLargestCityQuestions(cities, facts, largestCityCount),
        ...buildIsCapitalQuestions(cities, facts, isCapitalCount),
        ...buildIsLargestCityQuestions(cities, facts, isLargestCityCount),
        ...buildStatePopulationQuestions(facts, statePopulationCount),
        ...buildCityPopulationQuestions(cities, cityPopulationCount),
      ];
      return pickRandom(questions, questions.length);
    }
    case "officeholders": {
      const { governors, legislatorsWithPhoto, houseSeatCounts } = pool as OfficeholdersPool;
      const [governorCount, photoCount, partyCount, nameCount, chamberCount, seatCountCount] =
        randomSplit(SESSION_LENGTH, 6);
      const questions: QuizQuestion[] = [
        ...buildGovernorQuestions(governors, governorCount),
        ...buildOfficeholderPhotoQuestions(legislatorsWithPhoto, governors, photoCount),
        ...buildOfficeholderPartyQuestions(legislatorsWithPhoto, governors, partyCount),
        ...buildOfficeholderNameQuestions(legislatorsWithPhoto, governors, nameCount),
        ...buildChamberQuestions(legislatorsWithPhoto, chamberCount),
        ...buildHouseSeatCountQuestions(houseSeatCounts, seatCountCount),
      ];
      return pickRandom(questions, questions.length);
    }
    case "midterms": {
      const { candidates } = pool as MidtermsPool;
      const [partyCount, incumbencyCount] = randomSplit(SESSION_LENGTH, 2);
      const questions: QuizQuestion[] = [
        ...buildCandidatePartyQuestions(candidates, partyCount),
        ...buildIncumbencyQuestions(candidates, incumbencyCount),
      ];
      return pickRandom(questions, questions.length);
    }
    case "sports": {
      const teams = pool as SportsTeam[];
      const [logoCount, teamStateCount] = randomSplit(SESSION_LENGTH, 2);
      const questions: QuizQuestion[] = [
        ...buildTeamLogoQuestions(teams, logoCount),
        ...buildTeamStateQuestions(teams, teamStateCount),
      ];
      return pickRandom(questions, questions.length);
    }
    case "mashups": {
      const { sports } = pool as MashupsPool;
      return buildOddOneOutQuestions(sports, SESSION_LENGTH);
    }
    default:
      throw new Error(`No quiz engine registered for category "${category}"`);
  }
}

/** Whether this category offers a matching-pairs mode alongside its normal 10-question round. */
export function categoryHasMatchingMode(category: QuizCategoryId): boolean {
  return category === "sports";
}

/**
 * Builds a matching-pairs board from an already-fetched pool — same `pool` shape
 * fetchCategoryPool returned for this category, reused rather than a second fetch. Only called
 * for a category categoryHasMatchingMode() confirms has this mode.
 */
export function buildMatchingBoard(category: QuizCategoryId, pool: unknown): MatchingPair[] {
  switch (category) {
    case "sports": {
      const teams = pool as SportsTeam[];
      const available = teams.filter((t) => t.logoUrl !== null).length;
      return buildMatchingPairs(teams, Math.min(MATCHING_PAIR_COUNT, available));
    }
    default:
      throw new Error(`No matching board registered for category "${category}"`);
  }
}

/** Whether this category offers a timed speed-round mode alongside its normal 10-question round. */
export function categoryHasSpeedRoundMode(category: QuizCategoryId): boolean {
  return category === "mashups";
}

/**
 * Builds a shuffled speed-round question pool by drawing ~SPEED_ROUND_PER_GENERATOR questions
 * from every existing multiple-choice generator across Geography/Officeholders/Midterms/Sports
 * (deliberately excluding map-click, which needs a persistent map ill-suited to rapid-fire
 * answering, and matching, which isn't even a QuizQuestion). Reuses the exact same pool
 * fetchCategoryPool already fetched for Mashups — no second fetch. Only called for a category
 * categoryHasSpeedRoundMode() confirms has this mode.
 */
export function buildSpeedRoundPool(pool: unknown): MultipleChoiceQuestion[] {
  const { geography, officeholders, midterms, sports } = pool as MashupsPool;
  const n = SPEED_ROUND_PER_GENERATOR;
  const combined: MultipleChoiceQuestion[] = [
    ...buildCapitalQuestions(geography.states, Math.min(n, geography.states.length)),
    ...buildFlagQuestions(geography.states, Math.min(n, geography.states.length)),
    ...buildAbbreviationQuestions(geography.states, Math.min(n, geography.states.length)),
    ...buildCityStateQuestions(geography.cities, Math.min(n, geography.cities.length)),
    ...buildLargestCityQuestions(
      geography.cities,
      geography.states,
      Math.min(n, geography.cities.length),
    ),
    ...buildIsCapitalQuestions(
      geography.cities,
      geography.states,
      Math.min(n, geography.cities.length),
    ),
    ...buildIsLargestCityQuestions(
      geography.cities,
      geography.states,
      Math.min(n, geography.cities.length),
    ),
    ...buildStatePopulationQuestions(geography.states, Math.min(n, geography.states.length)),
    ...buildCityPopulationQuestions(geography.cities, Math.min(n, geography.cities.length)),
    ...buildGovernorQuestions(officeholders.governors, Math.min(n, officeholders.governors.length)),
    ...buildOfficeholderPhotoQuestions(
      officeholders.legislatorsWithPhoto,
      officeholders.governors,
      Math.min(n, officeholders.legislatorsWithPhoto.length + officeholders.governors.length),
    ),
    ...buildOfficeholderPartyQuestions(
      officeholders.legislatorsWithPhoto,
      officeholders.governors,
      Math.min(n, officeholders.legislatorsWithPhoto.length + officeholders.governors.length),
    ),
    ...buildOfficeholderNameQuestions(
      officeholders.legislatorsWithPhoto,
      officeholders.governors,
      Math.min(n, officeholders.legislatorsWithPhoto.length + officeholders.governors.length),
    ),
    ...buildChamberQuestions(
      officeholders.legislatorsWithPhoto,
      Math.min(n, officeholders.legislatorsWithPhoto.length),
    ),
    ...buildHouseSeatCountQuestions(
      officeholders.houseSeatCounts,
      Math.min(n, officeholders.houseSeatCounts.length),
    ),
    ...buildCandidatePartyQuestions(midterms.candidates, Math.min(n, midterms.candidates.length)),
    ...buildIncumbencyQuestions(midterms.candidates, Math.min(n, midterms.candidates.length)),
    ...buildTeamLogoQuestions(sports, Math.min(n, sports.filter((t) => t.logoUrl !== null).length)),
    ...buildTeamStateQuestions(sports, Math.min(n, sports.length)),
  ];
  return pickRandom(combined, combined.length);
}
