import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import { BackToMapLink } from "@/components/BackToMapLink";

// Every v1 question type needs at least 4 distinct subjects to build one 4-option question —
// see buildMultipleChoiceQuestion's own pool-size guard, which this mirrors so a doomed session
// never starts in the first place.
const MIN_POOL_SIZE = 4;

export function QuizStartScreen({
  category,
  poolSize,
  isLoading,
  onStart,
  hasMatchingMode,
  onStartMatching,
}: {
  category: QuizCategoryMeta;
  poolSize: number;
  isLoading: boolean;
  onStart: () => void;
  hasMatchingMode: boolean;
  onStartMatching: () => void;
}) {
  const canStart = !isLoading && poolSize >= MIN_POOL_SIZE;

  return (
    <div className="mx-auto w-full max-w-lg text-center">
      <BackToMapLink />
      <h1 className="mt-4 font-display text-3xl font-semibold text-ink">{category.label}</h1>
      <p className="mt-2 text-sm text-muted">{category.description}</p>
      {isLoading ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : canStart ? (
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={onStart}
            className="rounded bg-seal px-6 py-3 text-sm font-medium text-white"
          >
            Start Quiz
          </button>
          {hasMatchingMode && (
            <button
              onClick={onStartMatching}
              className="rounded border border-rule px-6 py-3 text-sm text-ink"
            >
              Play Matching
            </button>
          )}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Not enough data available for this category yet.</p>
      )}
    </div>
  );
}
