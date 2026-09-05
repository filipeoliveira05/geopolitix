"use client";

import { useState } from "react";
import type { QuizQuestion, AnsweredQuestion } from "./types";
import { searchSelectPoints } from "./search-select-points";
import { vibrateWrongAnswer } from "./haptics";

export function useQuizSession(questions: QuizQuestion[]) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnsweredQuestion[]>([]);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [mapClickAnswer, setMapClickAnswer] = useState<string | null>(null);
  const [searchSelectResult, setSearchSelectResult] = useState<{
    foundIds: string[];
    gaveUp: boolean;
  } | null>(null);

  const currentQuestion = questions[index] ?? null;
  const isComplete = index >= questions.length;

  function answerMultipleChoice(optionIndex: number) {
    if (!currentQuestion || currentQuestion.format !== "multiple-choice" || chosenIndex !== null) {
      return;
    }
    const correct = optionIndex === currentQuestion.correctIndex;
    if (!correct) vibrateWrongAnswer();
    setChosenIndex(optionIndex);
    setAnswers((prev) => [
      ...prev,
      {
        format: "multiple-choice",
        question: currentQuestion,
        chosenIndex: optionIndex,
        correct,
        points: correct ? 10 : 0,
      },
    ]);
  }

  function answerMapClick(clickedStateId: string) {
    if (!currentQuestion || currentQuestion.format !== "map-click" || mapClickAnswer !== null) {
      return;
    }
    const correct = clickedStateId === currentQuestion.targetStateId;
    if (!correct) vibrateWrongAnswer();
    setMapClickAnswer(clickedStateId);
    setAnswers((prev) => [
      ...prev,
      {
        format: "map-click",
        question: currentQuestion,
        clickedStateId,
        correct,
        points: correct ? 10 : 0,
      },
    ]);
  }

  // Called once per search-select question when it ends (either every target found, or the
  // player gives up) — intermediate per-guess state lives inside SearchSelectQuestionView itself,
  // not this hook, which only needs the final outcome (same granularity as the two answer
  // functions above, each called once per question).
  function answerSearchSelect(foundIds: string[], gaveUp: boolean) {
    if (
      !currentQuestion ||
      currentQuestion.format !== "search-select" ||
      searchSelectResult !== null
    ) {
      return;
    }
    const points = searchSelectPoints(foundIds.length, currentQuestion.targets.length);
    setSearchSelectResult({ foundIds, gaveUp });
    setAnswers((prev) => [
      ...prev,
      { format: "search-select", question: currentQuestion, foundIds, gaveUp, points },
    ]);
  }

  function next() {
    setChosenIndex(null);
    setMapClickAnswer(null);
    setSearchSelectResult(null);
    setIndex((i) => i + 1);
  }

  return {
    currentQuestion,
    index,
    total: questions.length,
    isComplete,
    chosenIndex,
    mapClickAnswer,
    searchSelectResult,
    answers,
    score: answers.reduce((sum, a) => sum + a.points, 0),
    answerMultipleChoice,
    answerMapClick,
    answerSearchSelect,
    next,
  };
}
