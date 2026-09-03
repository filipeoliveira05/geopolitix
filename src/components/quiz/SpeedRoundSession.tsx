"use client";

import { useEffect, useRef, useState } from "react";
import type { MultipleChoiceQuestion, AnsweredQuestion } from "@/lib/quiz/types";
import { MultipleChoiceQuestionView } from "./MultipleChoiceQuestionView";

export const SPEED_ROUND_SECONDS = 60;

// Brief pause after answering so the right/wrong highlight is actually visible before
// auto-advancing — speed round has no manual Next click, unlike every other session type.
const AUTO_ADVANCE_MS = 400;

export function SpeedRoundSession({
  questions,
  onComplete,
}: {
  questions: MultipleChoiceQuestion[];
  onComplete: (answers: AnsweredQuestion[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnsweredQuestion[]>([]);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SPEED_ROUND_SECONDS);
  // Guards against the timer-expiry path and the answer-driven auto-advance path both calling
  // onComplete if they race within the same ~400ms window — a ref (not state) so both closures
  // see the same up-to-date value without needing to be re-created every render.
  const endedRef = useRef(false);
  const answersRef = useRef<AnsweredQuestion[]>([]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Set up once on mount — reads the latest answers via answersRef rather than depending on
  // `answers` directly, so the interval itself is never torn down and recreated mid-countdown.
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          if (!endedRef.current) {
            endedRef.current = true;
            onComplete(answersRef.current);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately runs once; onComplete/answers are read via refs, not reactive deps
  }, []);

  const currentQuestion = questions[index] ?? null;

  function answer(optionIndex: number) {
    if (!currentQuestion || chosenIndex !== null || endedRef.current) return;
    const correct = optionIndex === currentQuestion.correctIndex;
    const nextAnswers: AnsweredQuestion[] = [
      ...answers,
      { format: "multiple-choice", question: currentQuestion, chosenIndex: optionIndex, correct },
    ];
    setChosenIndex(optionIndex);
    setAnswers(nextAnswers);
    setTimeout(() => {
      if (endedRef.current) return;
      const nextIndex = index + 1;
      if (nextIndex >= questions.length) {
        endedRef.current = true;
        onComplete(nextAnswers);
      } else {
        setChosenIndex(null);
        setIndex(nextIndex);
      }
    }, AUTO_ADVANCE_MS);
  }

  if (!currentQuestion) return null;

  return (
    <div className="mx-auto w-full max-w-lg">
      <p className="mb-2 text-sm text-muted">
        {secondsLeft}s left — Score: {answers.filter((a) => a.correct).length}
      </p>
      <MultipleChoiceQuestionView
        question={currentQuestion}
        chosenIndex={chosenIndex}
        onAnswer={answer}
      />
    </div>
  );
}
