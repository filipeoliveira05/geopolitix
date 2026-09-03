"use client";

import { useState } from "react";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import { getBestScore, type BestScore } from "@/lib/quiz/best-score";
import { BackToMapLink } from "@/components/BackToMapLink";
import { Card } from "@/components/Card";
import { CategoryIcon } from "./category-icons";

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
  hasSpeedRoundMode,
  onStartSpeedRound,
}: {
  category: QuizCategoryMeta;
  poolSize: number;
  isLoading: boolean;
  onStart: () => void;
  hasMatchingMode: boolean;
  onStartMatching: () => void;
  hasSpeedRoundMode: boolean;
  onStartSpeedRound: () => void;
}) {
  const canStart = !isLoading && poolSize >= MIN_POOL_SIZE;
  // Lazy initializer, not an effect — same reasoning as QuizResultsScreen's own best-score read:
  // no SSR/hydration pass ever shows this screen (it's inside a "use client" quiz page tree), so
  // reading localStorage here up front carries no mismatch risk. Read-only here, unlike the
  // results screen — starting a session never updates a best score, only finishing one does.
  const [best] = useState<BestScore | null>(() => getBestScore(category.id, null));

  return (
    <div className="mx-auto w-full max-w-lg text-center">
      <BackToMapLink />
      <Card className="mt-4">
        <CategoryIcon category={category.id} className="mx-auto h-10 w-10 text-seal" />
        <h1 className="mt-3 font-display text-3xl font-semibold text-ink">{category.label}</h1>
        <p className="mt-2 text-sm text-muted">{category.description}</p>
        {best && (
          <p className="mt-3 text-sm text-muted">
            Best: {best.score} / {best.total}
          </p>
        )}
      </Card>
      {isLoading ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : canStart ? (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
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
          {hasSpeedRoundMode && (
            <button
              onClick={onStartSpeedRound}
              className="rounded border border-rule px-6 py-3 text-sm text-ink"
            >
              Play Speed Round
            </button>
          )}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Not enough data available for this category yet.</p>
      )}
    </div>
  );
}
