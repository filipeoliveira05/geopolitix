"use client";

import { useState } from "react";
import Link from "next/link";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import type { AnsweredQuestion } from "@/lib/quiz/types";
import {
  getBestSpeedRound,
  updateBestSpeedRoundIfHigher,
  type BestScore,
} from "@/lib/quiz/best-score";

export function SpeedRoundResultsScreen({
  category,
  answers,
  onPlayAgain,
}: {
  category: QuizCategoryMeta;
  answers: AnsweredQuestion[];
  onPlayAgain: () => void;
}) {
  const score = answers.filter((a) => a.points === 10).length;
  const total = answers.length;
  // Lazy initializer, not an effect — same reasoning every other results screen in this app
  // already established: this component only ever mounts after a full client-side round, never
  // during initial SSR/hydration.
  const [best] = useState<BestScore | null>(
    () => updateBestSpeedRoundIfHigher(category.id, score, total) ?? getBestSpeedRound(category.id),
  );

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {score} / {total}
      </h1>
      <p className="mt-1 text-sm text-muted">Answered in 60 seconds.</p>
      {best && (
        <p className="mt-1 text-sm text-muted">
          Best: {best.score} / {best.total}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          onClick={onPlayAgain}
          className="rounded bg-seal px-4 py-2 text-sm font-medium text-white"
        >
          Play again
        </button>
        <Link href="/quiz" className="rounded border border-rule px-4 py-2 text-sm text-ink">
          Back to categories
        </Link>
      </div>
    </div>
  );
}
