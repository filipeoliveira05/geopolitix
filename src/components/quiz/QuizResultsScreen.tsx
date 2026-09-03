"use client";

import { useState } from "react";
import Link from "next/link";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import type { AnsweredQuestion } from "@/lib/quiz/types";
import { getBestScore, updateBestScoreIfHigher, type BestScore } from "@/lib/quiz/best-score";

export function QuizResultsScreen({
  category,
  answers,
  onPlayAgain,
}: {
  category: QuizCategoryMeta;
  answers: AnsweredQuestion[];
  onPlayAgain: () => void;
}) {
  const score = answers.filter((a) => a.correct).length;
  const total = answers.length;
  const missed = answers.filter((a) => !a.correct);
  // A lazy initializer, not an effect — this component only ever mounts after a full client-side
  // quiz session (never during the app's initial SSR/hydration pass), so reading/writing
  // localStorage here carries no hydration-mismatch risk, and avoids the extra render an
  // effect+setState would cause. State narrowing doesn't exist yet in this plan (see Global
  // Constraints) — every best score is recorded under stateAbbr: null ("overall"), the same key
  // a future narrowed session would fall back to.
  const [best] = useState<BestScore | null>(
    () => updateBestScoreIfHigher(category.id, null, score, total) ?? getBestScore(category.id, null),
  );

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {score} / {total}
      </h1>
      {best && (
        <p className="mt-1 text-sm text-muted">
          Best: {best.score} / {best.total}
        </p>
      )}

      {missed.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Missed questions
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {missed.map((a, i) => (
              <li key={i} className="text-sm text-muted">
                {a.question.prompt}{" "}
                <span className="text-ink">
                  {a.format === "multiple-choice"
                    ? a.question.options[a.question.correctIndex]
                    : a.question.targetStateName}
                </span>
              </li>
            ))}
          </ul>
        </div>
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
