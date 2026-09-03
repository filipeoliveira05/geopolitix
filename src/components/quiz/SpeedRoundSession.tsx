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

  // Set up once on mount — the updater only ever computes the next second count, nothing else;
  // calling onComplete (a different component's setState) from inside it is a real React rules-
  // of-hooks violation ("Cannot update a component while rendering a different component"),
  // caught live via the exact warning text plus an actually-premature round end during
  // verification — the completion side effect below is a separate effect for that reason, not
  // just a style preference.
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fires exactly once when the countdown reaches 0 — a proper effect (post-render), not a
  // state-updater side effect. onComplete/answersRef are read via refs/closure rather than
  // listed as deps, so an unrelated re-render (e.g. a new onComplete identity from the parent)
  // never re-fires this.
  useEffect(() => {
    if (secondsLeft === 0 && !endedRef.current) {
      endedRef.current = true;
      onComplete(answersRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only secondsLeft hitting 0 should trigger this; onComplete/answersRef are refs/closures, not reactive deps
  }, [secondsLeft]);

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
