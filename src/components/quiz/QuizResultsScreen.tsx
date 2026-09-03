"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import type { AnsweredQuestion } from "@/lib/quiz/types";
import { getBestScore, updateBestScoreIfHigher, type BestScore } from "@/lib/quiz/best-score";
import { getStateName } from "@/lib/states";
import { Card } from "@/components/Card";
import { SectionHeading } from "@/components/SectionHeading";
import { CheckIcon, XIcon, MapPinIcon } from "./icons";

// Same tier-color pairs this app already uses elsewhere (StatePanel's error text, UsMap's
// pre-2022-district disclaimer, WikipediaVerifiedBadge) — not new tokens, just reused at a new
// call site so a good/mediocre/rough score reads as one at a glance before you even read the
// numbers.
function scoreTierClassName(score: number, total: number): string {
  if (total === 0) return "text-ink";
  const pct = score / total;
  if (pct >= 0.8) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 0.5) return "text-amber-700 dark:text-amber-500";
  return "text-red-600 dark:text-red-400";
}

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
  //
  // `previousBest` is read BEFORE the update call so "New best!" can be shown only when this
  // session actually beat a prior record, not on someone's very first-ever play (which trivially
  // "sets" a best with nothing to have beaten).
  const [{ best, isNewBest }] = useState<{ best: BestScore | null; isNewBest: boolean }>(() => {
    const previousBest = getBestScore(category.id, null);
    const updated = updateBestScoreIfHigher(category.id, null, score, total) ?? previousBest;
    return { best: updated, isNewBest: previousBest !== null && score > previousBest.score };
  });

  return (
    <div className="mx-auto w-full max-w-lg">
      <Card className="text-center">
        <p className={`font-display text-5xl font-semibold ${scoreTierClassName(score, total)}`}>
          {score} / {total}
        </p>
        {best && (
          <p className="mt-2 text-sm text-muted">
            Best: {best.score} / {best.total}
            {isNewBest && (
              <span className="ml-2 font-medium text-emerald-600 dark:text-emerald-400">
                New best!
              </span>
            )}
          </p>
        )}
      </Card>

      {missed.length > 0 && (
        <Card className="mt-4">
          <SectionHeading>Missed questions</SectionHeading>
          <ul className="mt-3 flex flex-col gap-3">
            {missed.map((a, i) => {
              const imageUrl = a.format === "multiple-choice" ? a.question.imageUrl : null;
              return (
                <li key={i} className="flex items-start gap-3 text-sm">
                  {/* Centered against the h-9 thumbnail/icon slot next to it, not the row's
                      first text line — mt-0.5 alignment left it visibly sitting above center
                      once that slot grew taller than a single line of text. */}
                  <span className="flex h-9 shrink-0 items-center text-red-600 dark:text-red-400">
                    <XIcon />
                  </span>
                  {/* A fixed-size slot for every row's leading visual, thumbnail or icon alike —
                      an earlier version let a bare, unwrapped MapPinIcon sit next to a full-size
                      thumbnail box, so rows visibly jumped in width depending on which one showed. */}
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-paper">
                    {imageUrl ? (
                      <Image src={imageUrl} alt="" fill unoptimized className="object-contain" />
                    ) : (
                      <MapPinIcon className="absolute inset-0 m-auto h-5 w-5 text-muted" />
                    )}
                  </div>
                  {/* Prompt and answer are two deliberate stacked lines, not one inline text run
                      left to wrap wherever a given prompt's length happens to break — an earlier
                      version let some rows keep the answer on the same line and others wrap it,
                      with no consistent rhythm down the list. */}
                  <div className="flex flex-col gap-0.5">
                    <p className="text-ink">{a.question.prompt}</p>
                    {a.format === "multiple-choice" ? (
                      <p className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckIcon className="h-3.5 w-3.5" />
                        {a.question.options[a.question.correctIndex]}
                      </p>
                    ) : (
                      // The prompt already names the target state ("Click on Rhode Island.") —
                      // repeating it here would be pure redundancy, unlike a multiple-choice
                      // question whose prompt never reveals the answer. What actually got
                      // clicked is new information instead.
                      <p className="text-muted">
                        You clicked {getStateName(a.clickedStateId) ?? a.clickedStateId}.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
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
