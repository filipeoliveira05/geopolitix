import { getAllStateCapitalsAndFlags } from "@/lib/geography-data";
import { buildCapitalQuestions, buildFlagQuestions } from "./geography-questions";
import type { QuizCategoryId } from "./category-config";
import type { QuizQuestion } from "./types";

export const SESSION_LENGTH = 10;

/**
 * Fetches a category's full data pool — used both to check "is there enough data to play" (see
 * QuizStartScreen) and, once Start is pressed, to build the actual session. One fetch per
 * category-page visit (cached by the caller's TanStack Query key), never re-fetched per question.
 */
export async function fetchCategoryPool(category: QuizCategoryId): Promise<unknown[]> {
  switch (category) {
    case "geography":
      return getAllStateCapitalsAndFlags();
    default:
      return [];
  }
}

/**
 * Turns an already-fetched pool into one session's worth of questions. `pool` must be exactly
 * what `fetchCategoryPool` returned for this same category — each switch branch casts it back to
 * the concrete type its generators expect.
 */
export function buildCategorySession(category: QuizCategoryId, pool: unknown[]): QuizQuestion[] {
  switch (category) {
    case "geography": {
      const facts = pool as Awaited<ReturnType<typeof getAllStateCapitalsAndFlags>>;
      const half = Math.floor(SESSION_LENGTH / 2);
      return [
        ...buildCapitalQuestions(facts, half),
        ...buildFlagQuestions(facts, SESSION_LENGTH - half),
      ];
    }
    default:
      throw new Error(`No quiz engine registered for category "${category}"`);
  }
}
