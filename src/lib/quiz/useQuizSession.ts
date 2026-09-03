"use client";

import { useState } from "react";
import type { QuizQuestion, AnsweredQuestion } from "./types";

export function useQuizSession(questions: QuizQuestion[]) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnsweredQuestion[]>([]);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [mapClickAnswer, setMapClickAnswer] = useState<string | null>(null);

  const currentQuestion = questions[index] ?? null;
  const isComplete = index >= questions.length;

  function answerMultipleChoice(optionIndex: number) {
    if (!currentQuestion || currentQuestion.format !== "multiple-choice" || chosenIndex !== null) {
      return;
    }
    setChosenIndex(optionIndex);
    setAnswers((prev) => [
      ...prev,
      {
        format: "multiple-choice",
        question: currentQuestion,
        chosenIndex: optionIndex,
        correct: optionIndex === currentQuestion.correctIndex,
      },
    ]);
  }

  function answerMapClick(clickedStateId: string) {
    if (!currentQuestion || currentQuestion.format !== "map-click" || mapClickAnswer !== null) {
      return;
    }
    setMapClickAnswer(clickedStateId);
    setAnswers((prev) => [
      ...prev,
      {
        format: "map-click",
        question: currentQuestion,
        clickedStateId,
        correct: clickedStateId === currentQuestion.targetStateId,
      },
    ]);
  }

  function next() {
    setChosenIndex(null);
    setMapClickAnswer(null);
    setIndex((i) => i + 1);
  }

  return {
    currentQuestion,
    index,
    total: questions.length,
    isComplete,
    chosenIndex,
    mapClickAnswer,
    answers,
    score: answers.filter((a) => a.correct).length,
    answerMultipleChoice,
    answerMapClick,
    next,
  };
}
