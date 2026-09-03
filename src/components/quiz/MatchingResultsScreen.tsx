"use client";

import { useState } from "react";
import Link from "next/link";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import { getBestMatching, updateBestMatchingIfLower, type BestMatching } from "@/lib/quiz/best-score";

export function MatchingResultsScreen({
  category,
  mistakes,
  onPlayAgain,
}: {
  category: QuizCategoryMeta;
  mistakes: number;
  onPlayAgain: () => void;
}) {
  // Lazy initializer, not an effect — same reasoning QuizResultsScreen's own best-score read/
  // write already established: this component only ever mounts after a full client-side matching
  // round, never during initial SSR/hydration, so there's no hydration-mismatch risk here.
  const [best] = useState<BestMatching | null>(
    () => updateBestMatchingIfLower(category.id, mistakes) ?? getBestMatching(category.id),
  );

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {mistakes} mistake{mistakes === 1 ? "" : "s"}
      </h1>
      {best && (
        <p className="mt-1 text-sm text-muted">
          Best: {best.mistakes} mistake{best.mistakes === 1 ? "" : "s"}
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
