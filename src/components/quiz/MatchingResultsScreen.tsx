"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import { getBestMatching, submitQuizSession } from "@/lib/quiz/history-data";

export function MatchingResultsScreen({
  category,
  mistakes,
  pairCount,
  onPlayAgain,
}: {
  category: QuizCategoryMeta;
  mistakes: number;
  pairCount: number;
  onPlayAgain: () => void;
}) {
  const queryClient = useQueryClient();
  const bestQuery = useQuery({
    queryKey: ["quiz-best-matching", category.id],
    queryFn: () => getBestMatching(category.id),
  });
  const submitMutation = useMutation({
    mutationFn: () =>
      submitQuizSession({
        session: {
          id: crypto.randomUUID(),
          category: category.id,
          mode: "matching",
          score: null,
          total: null,
          mistakes,
          pairCount,
        },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["quiz-best-matching", category.id] }),
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
    ? previousBest && previousBest.mistakes <= mistakes
      ? previousBest
      : { mistakes, pairCount }
    : previousBest;

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {mistakes} mistake{mistakes === 1 ? "" : "s"}
      </h1>
      {displayBest && (
        <p className="mt-1 text-sm text-muted">
          Best: {displayBest.mistakes} mistake{displayBest.mistakes === 1 ? "" : "s"}
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
