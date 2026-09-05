import type { QuizCategoryId } from "./category-config";
import type { QuestionFormat } from "./types";

function storageKey(category: QuizCategoryId): string {
  return `geopolitix:quiz-formats:${category}`;
}

/**
 * Reads the player's saved format selection for a category, defaulting to every format in
 * `availableFormats` the first time (or on any storage failure/corrupt JSON) — same decorative,
 * never-blocks-play philosophy as best-score.ts. Also falls back to all-enabled if the saved set
 * is empty after filtering to what's currently available (e.g. a stale save naming a format that
 * no longer exists for this category), since a session needs at least one enabled format.
 */
export function getEnabledFormats(
  category: QuizCategoryId,
  availableFormats: QuestionFormat[],
): QuestionFormat[] {
  try {
    const raw = localStorage.getItem(storageKey(category));
    if (!raw) return availableFormats;
    const saved = JSON.parse(raw) as QuestionFormat[];
    const filtered = saved.filter((f) => availableFormats.includes(f));
    return filtered.length > 0 ? filtered : availableFormats;
  } catch {
    return availableFormats;
  }
}

export function setEnabledFormats(category: QuizCategoryId, formats: QuestionFormat[]): void {
  try {
    localStorage.setItem(storageKey(category), JSON.stringify(formats));
  } catch {
    // Decorative persistence — a failed write never blocks play.
  }
}
