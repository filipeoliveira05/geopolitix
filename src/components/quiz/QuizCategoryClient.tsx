"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { QuizCategoryMeta } from "@/lib/quiz/category-config";
import { fetchCategoryPool, buildCategorySession } from "@/lib/quiz/engine";
import type { MultipleChoiceQuestion, AnsweredQuestion } from "@/lib/quiz/types";
import { QuizStartScreen } from "./QuizStartScreen";
import { QuestionSession } from "./QuestionSession";
import { QuizResultsScreen } from "./QuizResultsScreen";

type Phase =
  | { name: "start" }
  | { name: "session"; questions: MultipleChoiceQuestion[] }
  | { name: "results"; answers: AnsweredQuestion[] };

export function QuizCategoryClient({ category }: { category: QuizCategoryMeta }) {
  const [phase, setPhase] = useState<Phase>({ name: "start" });
  const { data: pool, isLoading } = useQuery({
    queryKey: ["quiz-pool", category.id],
    queryFn: () => fetchCategoryPool(category.id),
  });

  function start() {
    if (!pool) return;
    const questions = buildCategorySession(category.id, pool) as MultipleChoiceQuestion[];
    setPhase({ name: "session", questions });
  }

  function finish(answers: AnsweredQuestion[]) {
    setPhase({ name: "results", answers });
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

  return (
    <QuizStartScreen
      category={category}
      poolSize={pool?.length ?? 0}
      isLoading={isLoading}
      onStart={start}
    />
  );
}
