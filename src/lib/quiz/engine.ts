// See docs/quiz-notes.md before adding a new question type or touching this file — full architecture and every category's question-type batch writeup lives there, not repeated here.

import {
  getAllStateCapitalsAndFlags,
  getAllCitiesWithState,
  getAllSportsTeams,
  getAllCollegeFootball,
  getAllCollegeBasketball,
  type StateFact,
  type CityFact,
  type SportsTeam,
  type CollegeProgram,
} from "@/lib/geography-data";
import { getAllCurrentGovernors, type GovernorFact } from "@/lib/governors-data";
import {
  getAllCurrentLegislatorsWithPhoto,
  getSenatorsByStateMap,
  type LegislatorStateFact,
  type TermWithLegislator,
} from "@/lib/legislators-data";
import { getHouseSeatCountsByState, type HouseSeatCountFact } from "@/lib/districts-data";
import { getSenateAndGovernorRaces, type Race } from "@/lib/races-data";
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
  buildCityRecallQuestions,
  buildStateSilhouetteQuestions,
} from "./geography-questions";
import {
  buildGovernorQuestions,
  buildOfficeholderPhotoQuestions,
  buildOfficeholderPartyQuestions,
  buildOfficeholderNameQuestions,
  buildChamberQuestions,
  buildHouseSeatCountQuestions,
  buildSenatorRecallQuestions,
} from "./officeholders-questions";
import {
  candidateFactsFromRaces,
  buildCandidatePartyQuestions,
  buildIncumbencyQuestions,
  buildRaceCandidateRecallQuestions,
  type CandidateFact,
} from "./midterms-questions";
import {
  buildTeamLogoQuestions,
  buildTeamStateQuestions,
  buildLeagueQuestions,
  buildTeamCityQuestions,
  buildTeamByCityQuestions,
  buildTeamByStateQuestions,
  buildSchoolFromNicknameQuestions,
  buildCollegeConferenceQuestions,
  buildProTeamCountQuestions,
  buildStateTeamRecallQuestions,
  buildMatchingPairs,
  restrictToPowerConferences,
  COLLEGE_FOOTBALL_POWER_CONFERENCES,
  COLLEGE_BASKETBALL_POWER_CONFERENCES,
} from "./sports-questions";
import { countOddOneOutEligibleStates, buildOddOneOutQuestions } from "./mashups-questions";
import { pickRandom, randomWeightedSplit } from "./random";
import {
  buildCityEntries,
  buildSenatorEntries,
  buildTeamEntries,
  createEntitySearch,
} from "./search-select-index";
import type { QuizCategoryId } from "./category-config";
import type {
  QuizQuestion,
  MultipleChoiceQuestion,
  MatchingPair,
  QuestionFormat,
  SearchSelectEntry,
} from "./types";

export const SESSION_LENGTH = 10;
export const MATCHING_PAIR_COUNT = 6;
const SPEED_ROUND_PER_GENERATOR = 5;

type GeographyPool = { states: StateFact[]; cities: CityFact[] };
type OfficeholdersPool = {
  governors: GovernorFact[];
  legislatorsWithPhoto: LegislatorStateFact[];
  houseSeatCounts: HouseSeatCountFact[];
  states: StateFact[]; // flag/name lookup for buildSenatorRecallQuestions
  senatorsByState: Map<string, TermWithLegislator[]>;
};
type MidtermsPool = {
  candidates: CandidateFact[];
  races: Race[]; // buildRaceCandidateRecallQuestions needs per-race candidate lists
  states: StateFact[]; // flag/name lookup
};
type SportsPool = {
  teams: SportsTeam[];
  collegeFootball: CollegeProgram[];
  collegeBasketball: CollegeProgram[];
  states: StateFact[]; // flag/name lookup for buildStateTeamRecallQuestions
};
type MashupsPool = {
  geography: GeographyPool;
  officeholders: OfficeholdersPool;
  midterms: MidtermsPool;
  sports: SportsPool;
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
      const [governors, legislatorsWithPhoto, houseSeatCounts, states, senatorsByState] =
        await Promise.all([
          getAllCurrentGovernors(),
          getAllCurrentLegislatorsWithPhoto(),
          getHouseSeatCountsByState(),
          getAllStateCapitalsAndFlags(),
          getSenatorsByStateMap(null),
        ]);
      const pool: OfficeholdersPool = {
        governors,
        legislatorsWithPhoto,
        houseSeatCounts,
        states,
        senatorsByState,
      };
      return pool;
    }
    case "midterms": {
      const [races, states] = await Promise.all([
        getSenateAndGovernorRaces(),
        getAllStateCapitalsAndFlags(),
      ]);
      const pool: MidtermsPool = { candidates: candidateFactsFromRaces(races), races, states };
      return pool;
    }
    case "sports": {
      const [teams, collegeFootball, collegeBasketball, states] = await Promise.all([
        getAllSportsTeams(),
        getAllCollegeFootball(),
        getAllCollegeBasketball(),
        getAllStateCapitalsAndFlags(),
      ]);
      const pool: SportsPool = { teams, collegeFootball, collegeBasketball, states };
      return pool;
    }
    case "mashups": {
      const [
        states,
        cities,
        governors,
        legislatorsWithPhoto,
        houseSeatCounts,
        officeholderStates,
        senatorsByState,
        races,
        midtermsStates,
        teams,
        collegeFootball,
        collegeBasketball,
        sportsStates,
      ] = await Promise.all([
        getAllStateCapitalsAndFlags(),
        getAllCitiesWithState(),
        getAllCurrentGovernors(),
        getAllCurrentLegislatorsWithPhoto(),
        getHouseSeatCountsByState(),
        getAllStateCapitalsAndFlags(),
        getSenatorsByStateMap(null),
        getSenateAndGovernorRaces(),
        getAllStateCapitalsAndFlags(),
        getAllSportsTeams(),
        getAllCollegeFootball(),
        getAllCollegeBasketball(),
        getAllStateCapitalsAndFlags(),
      ]);
      const pool: MashupsPool = {
        geography: { states, cities },
        officeholders: {
          governors,
          legislatorsWithPhoto,
          houseSeatCounts,
          states: officeholderStates,
          senatorsByState,
        },
        midterms: { candidates: candidateFactsFromRaces(races), races, states: midtermsStates },
        sports: { teams, collegeFootball, collegeBasketball, states: sportsStates },
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
      const { governors, legislatorsWithPhoto, houseSeatCounts, senatorsByState } =
        pool as OfficeholdersPool;
      return Math.min(
        governors.length,
        legislatorsWithPhoto.length,
        houseSeatCounts.length,
        senatorsByState.size,
      );
    }
    case "midterms": {
      const { candidates, races } = pool as MidtermsPool;
      return Math.min(candidates.length, races.length);
    }
    case "sports":
      return (pool as SportsPool).teams.length;
    case "mashups":
      return countOddOneOutEligibleStates((pool as MashupsPool).sports.teams);
    default:
      return 0;
  }
}

/**
 * Turns an already-fetched pool into one session's worth of questions, respecting the player's
 * enabled formats (from the start screen's format picker). Each category branch with more than
 * one generator builds a `[format, generatorFn]` table, filters it down to `enabledFormats`
 * BEFORE rolling `randomWeightedSplit` — a disabled format's generators are never in the roll at
 * all, not just zeroed out afterward. `randomWeightedSplit` is a true multinomial roll per session
 * slot (a generator can land on 0, up to the full session length) — see random.ts's own doc
 * comment. The combined result is shuffled (`pickRandom(qs, qs.length)`) so type order is random
 * too. `pool` must be exactly what `fetchCategoryPool` returned for this same category.
 */
export function buildCategorySession(
  category: QuizCategoryId,
  pool: unknown,
  enabledFormats: QuestionFormat[],
): QuizQuestion[] {
  switch (category) {
    case "geography": {
      const { states: facts, cities } = pool as GeographyPool;
      const generators: [QuestionFormat, (n: number) => QuizQuestion[]][] = [
        ["multiple-choice", (n) => buildCapitalQuestions(facts, n)],
        ["multiple-choice", (n) => buildFlagQuestions(facts, n)],
        ["map-click", (n) => buildMapClickQuestions(facts, n)],
        ["multiple-choice", (n) => buildAbbreviationQuestions(facts, n)],
        ["multiple-choice", (n) => buildCityStateQuestions(cities, n)],
        ["multiple-choice", (n) => buildLargestCityQuestions(cities, facts, n)],
        ["multiple-choice", (n) => buildIsCapitalQuestions(cities, facts, n)],
        ["multiple-choice", (n) => buildIsLargestCityQuestions(cities, facts, n)],
        ["multiple-choice", (n) => buildStatePopulationQuestions(facts, n)],
        ["multiple-choice", (n) => buildCityPopulationQuestions(cities, n)],
        ["search-select", (n) => buildCityRecallQuestions(cities, facts, n)],
        ["multiple-choice", (n) => buildStateSilhouetteQuestions(facts, n)],
      ];
      const active = generators.filter(([format]) => enabledFormats.includes(format));
      const counts = randomWeightedSplit(SESSION_LENGTH, active.length);
      const questions = active.flatMap(([, build], i) => build(counts[i]));
      return pickRandom(questions, questions.length);
    }
    case "officeholders": {
      const { governors, legislatorsWithPhoto, houseSeatCounts, states, senatorsByState } =
        pool as OfficeholdersPool;
      const generators: [QuestionFormat, (n: number) => QuizQuestion[]][] = [
        ["multiple-choice", (n) => buildGovernorQuestions(governors, n)],
        ["multiple-choice", (n) => buildOfficeholderPhotoQuestions(legislatorsWithPhoto, governors, n)],
        ["multiple-choice", (n) => buildOfficeholderPartyQuestions(legislatorsWithPhoto, governors, n)],
        ["multiple-choice", (n) => buildOfficeholderNameQuestions(legislatorsWithPhoto, governors, n)],
        ["multiple-choice", (n) => buildChamberQuestions(legislatorsWithPhoto, n)],
        ["multiple-choice", (n) => buildHouseSeatCountQuestions(houseSeatCounts, n)],
        ["search-select", (n) => buildSenatorRecallQuestions(senatorsByState, states, n)],
      ];
      const active = generators.filter(([format]) => enabledFormats.includes(format));
      const counts = randomWeightedSplit(SESSION_LENGTH, active.length);
      const questions = active.flatMap(([, build], i) => build(counts[i]));
      return pickRandom(questions, questions.length);
    }
    case "midterms": {
      const { candidates, races, states } = pool as MidtermsPool;
      const generators: [QuestionFormat, (n: number) => QuizQuestion[]][] = [
        ["multiple-choice", (n) => buildCandidatePartyQuestions(candidates, n)],
        ["multiple-choice", (n) => buildIncumbencyQuestions(candidates, n)],
        ["search-select", (n) => buildRaceCandidateRecallQuestions(races, states, n)],
      ];
      const active = generators.filter(([format]) => enabledFormats.includes(format));
      const counts = randomWeightedSplit(SESSION_LENGTH, active.length);
      const questions = active.flatMap(([, build], i) => build(counts[i]));
      return pickRandom(questions, questions.length);
    }
    case "sports": {
      const { teams, collegeFootball, collegeBasketball, states } = pool as SportsPool;
      const generators: [QuestionFormat, (n: number) => QuizQuestion[]][] = [
        ["multiple-choice", (n) => buildTeamLogoQuestions(teams, collegeFootball, collegeBasketball, n)],
        ["multiple-choice", (n) => buildTeamStateQuestions(teams, n)],
        ["multiple-choice", (n) => buildLeagueQuestions(teams, n)],
        ["multiple-choice", (n) => buildTeamCityQuestions(teams, n)],
        ["multiple-choice", (n) => buildTeamByCityQuestions(teams, n)],
        ["multiple-choice", (n) => buildTeamByStateQuestions(teams, n)],
        ["multiple-choice", (n) => buildSchoolFromNicknameQuestions(collegeFootball, collegeBasketball, n)],
        [
          "multiple-choice",
          (n) => buildCollegeConferenceQuestions(collegeFootball, collegeBasketball, n),
        ],
        ["multiple-choice", (n) => buildProTeamCountQuestions(teams, n)],
        ["search-select", (n) => buildStateTeamRecallQuestions(teams, states, n)],
      ];
      const active = generators.filter(([format]) => enabledFormats.includes(format));
      const counts = randomWeightedSplit(SESSION_LENGTH, active.length);
      const questions = active.flatMap(([, build], i) => build(counts[i]));
      return pickRandom(questions, questions.length);
    }
    case "mashups": {
      const { sports } = pool as MashupsPool;
      return buildOddOneOutQuestions(sports.teams, SESSION_LENGTH);
    }
    default:
      throw new Error(`No quiz engine registered for category "${category}"`);
  }
}

/**
 * The shared search function for a category's search-select questions with entityType "city",
 * "senator", or "team" — built once per pool (one Fuse instance internally, reused across every
 * keystroke by the caller). Returns null for a category with no shared-index entityType: Midterms
 * uses each question's own `searchPool` field instead (a candidate's relevance is scoped to one
 * race, not a nationwide index), and Mashups has no search-select questions at all.
 */
export function buildSharedSearchFn(
  category: QuizCategoryId,
  pool: unknown,
): ((query: string) => SearchSelectEntry[]) | null {
  switch (category) {
    case "geography":
      return createEntitySearch(buildCityEntries((pool as GeographyPool).cities));
    case "officeholders":
      return createEntitySearch(buildSenatorEntries((pool as OfficeholdersPool).senatorsByState));
    case "sports":
      return createEntitySearch(buildTeamEntries((pool as SportsPool).teams));
    default:
      return null;
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
      const { teams } = pool as SportsPool;
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
    ...buildTeamLogoQuestions(
      sports.teams,
      sports.collegeFootball,
      sports.collegeBasketball,
      Math.min(
        n,
        sports.teams.filter((t) => t.logoUrl !== null).length +
          restrictToPowerConferences(sports.collegeFootball, COLLEGE_FOOTBALL_POWER_CONFERENCES)
            .filter((p) => p.logoUrl !== null).length +
          restrictToPowerConferences(sports.collegeBasketball, COLLEGE_BASKETBALL_POWER_CONFERENCES)
            .filter((p) => p.logoUrl !== null).length,
      ),
    ),
    ...buildTeamStateQuestions(sports.teams, Math.min(n, sports.teams.length)),
    ...buildLeagueQuestions(sports.teams, Math.min(n, sports.teams.length)),
    ...buildTeamCityQuestions(sports.teams, Math.min(n, sports.teams.length)),
    ...buildTeamByCityQuestions(sports.teams, Math.min(n, sports.teams.length)),
    ...buildTeamByStateQuestions(sports.teams, Math.min(n, sports.teams.length)),
    ...buildSchoolFromNicknameQuestions(
      sports.collegeFootball,
      sports.collegeBasketball,
      Math.min(
        n,
        [
          ...restrictToPowerConferences(sports.collegeFootball, COLLEGE_FOOTBALL_POWER_CONFERENCES),
          ...restrictToPowerConferences(sports.collegeBasketball, COLLEGE_BASKETBALL_POWER_CONFERENCES),
        ].filter((p) => p.nickname !== null).length,
      ),
    ),
    ...buildCollegeConferenceQuestions(
      sports.collegeFootball,
      sports.collegeBasketball,
      Math.min(
        n,
        restrictToPowerConferences(sports.collegeFootball, COLLEGE_FOOTBALL_POWER_CONFERENCES)
          .length +
          restrictToPowerConferences(sports.collegeBasketball, COLLEGE_BASKETBALL_POWER_CONFERENCES)
            .length,
      ),
    ),
    ...buildProTeamCountQuestions(sports.teams, n),
  ];
  return pickRandom(combined, combined.length);
}
