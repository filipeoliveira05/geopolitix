"use client";

import { useState } from "react";
import type { MultipleChoiceQuestion, AnsweredQuestion } from "./types";

export function useQuizSession(questions: MultipleChoiceQuestion[]) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnsweredQuestion[]>([]);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);

  const currentQuestion = questions[index] ?? null;
  const isComplete = index >= questions.length;

  function answer(optionIndex: number) {
    if (!currentQuestion || chosenIndex !== null) return; // already answered this question
    setChosenIndex(optionIndex);
    setAnswers((prev) => [
      ...prev,
      {
        question: currentQuestion,
        chosenIndex: optionIndex,
        correct: optionIndex === currentQuestion.correctIndex,
      },
    ]);
  }

  function next() {
    setChosenIndex(null);
    setIndex((i) => i + 1);
  }

  return {
    currentQuestion,
    index,
    total: questions.length,
    isComplete,
    chosenIndex,
    answers,
    score: answers.filter((a) => a.correct).length,
    answer,
    next,
  };
}
