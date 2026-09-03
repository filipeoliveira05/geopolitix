"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import {
  fetchCategoryPool,
  buildCategorySession,
  getCategoryPoolSize,
  categoryHasMatchingMode,
  buildMatchingBoard,
} from "@/lib/quiz/engine";
import type { QuizQuestion, AnsweredQuestion, MatchingPair } from "@/lib/quiz/types";
import { QuizStartScreen } from "./QuizStartScreen";
import { QuestionSession } from "./QuestionSession";
import { QuizResultsScreen } from "./QuizResultsScreen";
import { MatchingSession } from "./MatchingSession";
import { MatchingResultsScreen } from "./MatchingResultsScreen";

type Phase =
  | { name: "start" }
  | { name: "session"; questions: QuizQuestion[] }
  | { name: "results"; answers: AnsweredQuestion[] }
  | { name: "matching"; pairs: MatchingPair[] }
  | { name: "matching-results"; mistakes: number };

export function QuizCategoryClient({ category }: { category: QuizCategoryMeta }) {
  const [phase, setPhase] = useState<Phase>({ name: "start" });
  const { data: pool, isLoading } = useQuery({
    queryKey: ["quiz-pool", category.id],
    queryFn: () => fetchCategoryPool(category.id),
  });

  function start() {
    if (!pool) return;
    const questions = buildCategorySession(category.id, pool);
    setPhase({ name: "session", questions });
  }

  function startMatching() {
    if (!pool) return;
    const pairs = buildMatchingBoard(category.id, pool);
    setPhase({ name: "matching", pairs });
  }

  function finish(answers: AnsweredQuestion[]) {
    setPhase({ name: "results", answers });
  }

  function finishMatching(mistakes: number) {
    setPhase({ name: "matching-results", mistakes });
  }

  function playAgain() {
    setPhase({ name: "start" });
  }

  if (phase.name === "session") {
    return <QuestionSession questions={phase.questions} onComplete={finish} />;
  }

  if (phase.name === "results") {
    return (
      <QuizResultsScreen category={category} answers={phase.answers} onPlayAgain={playAgain} />
    );
  }

  if (phase.name === "matching") {
    return <MatchingSession pairs={phase.pairs} onComplete={finishMatching} />;
  }

  if (phase.name === "matching-results") {
    return (
      <MatchingResultsScreen
        category={category}
        mistakes={phase.mistakes}
        onPlayAgain={playAgain}
      />
    );
  }

  return (
    <QuizStartScreen
      category={category}
      poolSize={pool !== undefined ? getCategoryPoolSize(category.id, pool) : 0}
      isLoading={isLoading}
      onStart={start}
      hasMatchingMode={categoryHasMatchingMode(category.id)}
      onStartMatching={startMatching}
    />
  );
}
