"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import type { AnsweredQuestion } from "@/lib/quiz/types";
import { getBestSession, submitQuizSession } from "@/lib/quiz/history-data";
import { deriveSessionAnswerRows } from "@/lib/quiz/history-derive";
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
  const score = answers.reduce((sum, a) => sum + a.points, 0);
  const total = answers.length * 10;
  const missed = answers.filter((a) => a.points < 10);

  const queryClient = useQueryClient();
  const bestQuery = useQuery({
    queryKey: ["quiz-best", category.id, "standard"],
    queryFn: () => getBestSession(category.id, "standard"),
  });
  const submitMutation = useMutation({
    mutationFn: () =>
      submitQuizSession({
        session: {
          id: crypto.randomUUID(),
          category: category.id,
          mode: "standard",
          score,
          total,
          mistakes: null,
          pairCount: null,
        },
        answers: deriveSessionAnswerRows(answers),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["quiz-best", category.id, "standard"] }),
  });
  // Submits exactly once per mount, and only after the "previous best" read has resolved — this
  // ordering is what makes isNewBest correct: without waiting for bestQuery first, the submit
  // could land before the read and every session would look like a "new best" against its own
  // just-written row.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (!bestQuery.isSuccess || submittedRef.current) return;
    submittedRef.current = true;
    submitMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestQuery.isSuccess]);

  const previousBest = bestQuery.data ?? null;
  const isNewBest = previousBest !== null && score > previousBest.score;
  const displayBest = submitMutation.isSuccess
    ? previousBest && previousBest.score >= score
      ? previousBest
      : { score, total }
    : previousBest;

  return (
    <div className="mx-auto w-full max-w-lg">
      <Card className="text-center">
        <p className={`font-display text-5xl font-semibold ${scoreTierClassName(score, total)}`}>
          {score} / {total}
        </p>
        {displayBest && (
          <p className="mt-2 text-sm text-muted">
            Best: {displayBest.score} / {displayBest.total}
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
              const imageUrl =
                a.format === "multiple-choice" || a.format === "search-select"
                  ? a.question.imageUrl
                  : null;
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
                    ) : a.format === "map-click" ? (
                      // The prompt already names the target state ("Click on Rhode Island.") —
                      // repeating it here would be pure redundancy, unlike a multiple-choice
                      // question whose prompt never reveals the answer. What actually got
                      // clicked is new information instead.
                      <p className="text-muted">
                        You clicked {getStateName(a.clickedStateId) ?? a.clickedStateId}.
                      </p>
                    ) : (
                      <>
                        <p className="text-muted">
                          Found {a.foundIds.length}/{a.question.targets.length}
                          {a.foundIds.length > 0 && (
                            <>
                              :{" "}
                              {a.question.targets
                                .filter((t) => a.foundIds.includes(t.id))
                                .map((t) => t.label)
                                .join(", ")}
                            </>
                          )}
                        </p>
                        {a.foundIds.length < a.question.targets.length && (
                          <p className="text-red-600 dark:text-red-400">
                            Missed:{" "}
                            {a.question.targets
                              .filter((t) => !a.foundIds.includes(t.id))
                              .map((t) => t.label)
                              .join(", ")}
                          </p>
                        )}
                      </>
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
