import { getAllStateCapitalsAndFlags, getAllSportsTeams, type StateFact, type SportsTeam } from "@/lib/geography-data";
import { getAllCurrentGovernors, type GovernorFact } from "@/lib/governors-data";
import { getAllCurrentLegislatorsWithPhoto, type LegislatorStateFact } from "@/lib/legislators-data";
import { getSenateAndGovernorRaces } from "@/lib/races-data";
import { buildCapitalQuestions, buildFlagQuestions, buildMapClickQuestions } from "./geography-questions";
import { buildGovernorQuestions, buildLegislatorPhotoQuestions } from "./officeholders-questions";
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
import { pickRandom } from "./random";
import type { QuizCategoryId } from "./category-config";
import type { QuizQuestion, MultipleChoiceQuestion, MatchingPair } from "./types";

export const SESSION_LENGTH = 10;
export const MATCHING_PAIR_COUNT = 6;
const SPEED_ROUND_PER_GENERATOR = 5;

type OfficeholdersPool = { governors: GovernorFact[]; legislatorsWithPhoto: LegislatorStateFact[] };
type MidtermsPool = { candidates: CandidateFact[] };
type MashupsPool = {
  geography: StateFact[];
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
    case "geography":
      return getAllStateCapitalsAndFlags();
    case "officeholders": {
      const [governors, legislatorsWithPhoto] = await Promise.all([
        getAllCurrentGovernors(),
        getAllCurrentLegislatorsWithPhoto(),
      ]);
      const pool: OfficeholdersPool = { governors, legislatorsWithPhoto };
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
      const [geography, governors, legislatorsWithPhoto, races, sports] = await Promise.all([
        getAllStateCapitalsAndFlags(),
        getAllCurrentGovernors(),
        getAllCurrentLegislatorsWithPhoto(),
        getSenateAndGovernorRaces(),
        getAllSportsTeams(),
      ]);
      const pool: MashupsPool = {
        geography,
        officeholders: { governors, legislatorsWithPhoto },
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
    case "geography":
      return (pool as StateFact[]).length;
    case "officeholders": {
      const { governors, legislatorsWithPhoto } = pool as OfficeholdersPool;
      return Math.min(governors.length, legislatorsWithPhoto.length);
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
 */
export function buildCategorySession(category: QuizCategoryId, pool: unknown): QuizQuestion[] {
  const half = Math.floor(SESSION_LENGTH / 2);
  switch (category) {
    case "geography": {
      const facts = pool as StateFact[];
      const third = Math.floor(SESSION_LENGTH / 3);
      return [
        ...buildCapitalQuestions(facts, third),
        ...buildFlagQuestions(facts, third),
        ...buildMapClickQuestions(facts, SESSION_LENGTH - third * 2),
      ];
    }
    case "officeholders": {
      const { governors, legislatorsWithPhoto } = pool as OfficeholdersPool;
      return [
        ...buildGovernorQuestions(governors, half),
        ...buildLegislatorPhotoQuestions(legislatorsWithPhoto, SESSION_LENGTH - half),
      ];
    }
    case "midterms": {
      const { candidates } = pool as MidtermsPool;
      return [
        ...buildCandidatePartyQuestions(candidates, half),
        ...buildIncumbencyQuestions(candidates, SESSION_LENGTH - half),
      ];
    }
    case "sports": {
      const teams = pool as SportsTeam[];
      return [
        ...buildTeamLogoQuestions(teams, half),
        ...buildTeamStateQuestions(teams, SESSION_LENGTH - half),
      ];
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
    ...buildCapitalQuestions(geography, Math.min(n, geography.length)),
    ...buildFlagQuestions(geography, Math.min(n, geography.length)),
    ...buildGovernorQuestions(officeholders.governors, Math.min(n, officeholders.governors.length)),
    ...buildLegislatorPhotoQuestions(
      officeholders.legislatorsWithPhoto,
      Math.min(n, officeholders.legislatorsWithPhoto.length),
    ),
    ...buildCandidatePartyQuestions(midterms.candidates, Math.min(n, midterms.candidates.length)),
    ...buildIncumbencyQuestions(midterms.candidates, Math.min(n, midterms.candidates.length)),
    ...buildTeamLogoQuestions(sports, Math.min(n, sports.filter((t) => t.logoUrl !== null).length)),
    ...buildTeamStateQuestions(sports, Math.min(n, sports.length)),
  ];
  return pickRandom(combined, combined.length);
}
