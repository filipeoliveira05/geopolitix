"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import type { AnsweredQuestion } from "@/lib/quiz/types";
import { getBestSession, submitQuizSession } from "@/lib/quiz/history-data";
import { deriveSessionAnswerRows } from "@/lib/quiz/history-derive";

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

  const queryClient = useQueryClient();
  const bestQuery = useQuery({
    queryKey: ["quiz-best", category.id, "speed_round"],
    queryFn: () => getBestSession(category.id, "speed_round"),
  });
  const submitMutation = useMutation({
    mutationFn: () =>
      submitQuizSession({
        session: {
          id: crypto.randomUUID(),
          category: category.id,
          mode: "speed_round",
          score,
          total,
          mistakes: null,
          pairCount: null,
        },
        answers: deriveSessionAnswerRows(answers),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["quiz-best", category.id, "speed_round"] }),
  });
  const submittedRef = useRef(false);
  useEffect(() => {
    if (!bestQuery.isSuccess || submittedRef.current) return;
    submittedRef.current = true;
    submitMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestQuery.isSuccess]);

  const previousBest = bestQuery.data ?? null;
  const displayBest = submitMutation.isSuccess
    ? previousBest && previousBest.score >= score
      ? previousBest
      : { score, total }
    : previousBest;

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {score} / {total}
      </h1>
      <p className="mt-1 text-sm text-muted">Answered in 60 seconds.</p>
      {displayBest && (
        <p className="mt-1 text-sm text-muted">
          Best: {displayBest.score} / {displayBest.total}
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
