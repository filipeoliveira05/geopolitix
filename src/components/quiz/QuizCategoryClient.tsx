"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import {
  fetchCategoryPool,
  buildCategorySession,
  buildSharedSearchFn,
  getCategoryPoolSize,
  categoryHasMatchingMode,
  buildMatchingBoard,
  categoryHasSpeedRoundMode,
  buildSpeedRoundPool,
} from "@/lib/quiz/engine";
import type {
  QuizQuestion,
  MultipleChoiceQuestion,
  AnsweredQuestion,
  MatchingPair,
  QuestionFormat,
} from "@/lib/quiz/types";
import { QuizStartScreen } from "./QuizStartScreen";
import { QuestionSession } from "./QuestionSession";
import { QuizResultsScreen } from "./QuizResultsScreen";
import { MatchingSession } from "./MatchingSession";
import { MatchingResultsScreen } from "./MatchingResultsScreen";
import { SpeedRoundSession } from "./SpeedRoundSession";
import { SpeedRoundResultsScreen } from "./SpeedRoundResultsScreen";

type Phase =
  | { name: "start" }
  | { name: "session"; questions: QuizQuestion[] }
  | { name: "results"; answers: AnsweredQuestion[] }
  | { name: "matching"; pairs: MatchingPair[] }
  | { name: "matching-results"; mistakes: number }
  | { name: "speed-round"; questions: MultipleChoiceQuestion[] }
  | { name: "speed-round-results"; answers: AnsweredQuestion[] };

export function QuizCategoryClient({ category }: { category: QuizCategoryMeta }) {
  const [phase, setPhase] = useState<Phase>({ name: "start" });
  const { data: pool, isLoading } = useQuery({
    queryKey: ["quiz-pool", category.id],
    queryFn: () => fetchCategoryPool(category.id),
  });

  const sharedSearch = useMemo(
    () => (pool !== undefined ? buildSharedSearchFn(category.id, pool) : null),
    [category.id, pool],
  );

  function start(enabledFormats: QuestionFormat[]) {
    if (!pool) return;
    const questions = buildCategorySession(category.id, pool, enabledFormats);
    setPhase({ name: "session", questions });
  }

  function startMatching() {
    if (!pool) return;
    const pairs = buildMatchingBoard(category.id, pool);
    setPhase({ name: "matching", pairs });
  }

  function startSpeedRound() {
    if (!pool) return;
    const questions = buildSpeedRoundPool(pool);
    setPhase({ name: "speed-round", questions });
  }

  function finish(answers: AnsweredQuestion[]) {
    setPhase({ name: "results", answers });
  }

  function finishMatching(mistakes: number) {
    setPhase({ name: "matching-results", mistakes });
  }

  function finishSpeedRound(answers: AnsweredQuestion[]) {
    setPhase({ name: "speed-round-results", answers });
  }

  function playAgain() {
    setPhase({ name: "start" });
  }

  if (phase.name === "session") {
    return (
      <QuestionSession
        questions={phase.questions}
        onComplete={finish}
        sharedSearch={sharedSearch}
      />
    );
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

  if (phase.name === "speed-round") {
    return <SpeedRoundSession questions={phase.questions} onComplete={finishSpeedRound} />;
  }

  if (phase.name === "speed-round-results") {
    return (
      <SpeedRoundResultsScreen
        category={category}
        answers={phase.answers}
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
      hasSpeedRoundMode={categoryHasSpeedRoundMode(category.id)}
      onStartSpeedRound={startSpeedRound}
    />
  );
}
