import type { QuizCategoryId } from "./category-config";

export type BestScore = { score: number; total: number; date: string };

function storageKey(category: QuizCategoryId, stateAbbr: string | null): string {
  return `geopolitix:quiz-best:${category}:${stateAbbr ?? "any"}`;
}

// Wrapped in try/catch, silently returns null on any failure (private browsing, blocked storage,
// corrupt JSON) — a best-score note is decorative, never something that should block play. Same
// "decorative, never blocks the page" philosophy as this app's sync-freshness notes.
export function getBestScore(category: QuizCategoryId, stateAbbr: string | null): BestScore | null {
  try {
    const raw = localStorage.getItem(storageKey(category, stateAbbr));
    return raw ? (JSON.parse(raw) as BestScore) : null;
  } catch {
    return null;
  }
}

/**
 * Writes a new best score only if it beats the existing one. Always returns the score that ends
 * up stored (the new one if it won, the existing one otherwise) so the caller can display it
 * without a second read; returns null only if storage itself is unavailable.
 */
export function updateBestScoreIfHigher(
  category: QuizCategoryId,
  stateAbbr: string | null,
  score: number,
  total: number,
): BestScore | null {
  try {
    const existing = getBestScore(category, stateAbbr);
    if (existing && existing.score >= score) return existing;
    const next: BestScore = { score, total, date: new Date().toISOString() };
    localStorage.setItem(storageKey(category, stateAbbr), JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}
