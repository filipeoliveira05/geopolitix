import { getAllStateCapitalsAndFlags, type StateFact } from "@/lib/geography-data";
import { getAllCurrentGovernors, type GovernorFact } from "@/lib/governors-data";
import { getAllCurrentLegislatorsWithPhoto, type LegislatorStateFact } from "@/lib/legislators-data";
import { getSenateAndGovernorRaces } from "@/lib/races-data";
import { buildCapitalQuestions, buildFlagQuestions } from "./geography-questions";
import { buildGovernorQuestions, buildLegislatorPhotoQuestions } from "./officeholders-questions";
import {
  candidateFactsFromRaces,
  buildCandidatePartyQuestions,
  buildIncumbencyQuestions,
  type CandidateFact,
} from "./midterms-questions";
import type { QuizCategoryId } from "./category-config";
import type { QuizQuestion } from "./types";

export const SESSION_LENGTH = 10;

type OfficeholdersPool = { governors: GovernorFact[]; legislatorsWithPhoto: LegislatorStateFact[] };
type MidtermsPool = { candidates: CandidateFact[] };

/**
 * Fetches a category's full data pool — used both to check "is there enough data to play" (see
 * getCategoryPoolSize below) and, once Start is pressed, to build the actual session. One fetch
 * per category-page visit (cached by the caller's TanStack Query key), never re-fetched per
 * question. The pool's shape differs per category (a flat array for Geography, an object of two
 * independent arrays for Officeholders, since its two question types draw from unrelated tables)
 * — callers must go through getCategoryPoolSize/buildCategorySession, never inspect the shape
 * directly.
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
    default:
      return [];
  }
}

/**
 * How many distinct playable subjects a category's pool actually has — used by QuizStartScreen
 * to gate the Start button. For Officeholders (two independent question types, each needing its
 * own minimum) this is the SMALLER of the two pools, since a session draws from both.
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
      return [
        ...buildCapitalQuestions(facts, half),
        ...buildFlagQuestions(facts, SESSION_LENGTH - half),
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
    default:
      throw new Error(`No quiz engine registered for category "${category}"`);
  }
}
