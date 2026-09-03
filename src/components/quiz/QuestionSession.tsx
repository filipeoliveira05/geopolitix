"use client";

import { useEffect } from "react";
import { useQuizSession } from "@/lib/quiz/useQuizSession";
import type { QuizQuestion, AnsweredQuestion } from "@/lib/quiz/types";
import { MultipleChoiceQuestionView } from "./MultipleChoiceQuestionView";
import { MapClickQuestionView } from "./MapClickQuestionView";

export function QuestionSession({
  questions,
  onComplete,
}: {
  questions: QuizQuestion[];
  onComplete: (answers: AnsweredQuestion[]) => void;
}) {
  const session = useQuizSession(questions);

  useEffect(() => {
    if (session.isComplete) onComplete(session.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when isComplete flips, not on every answers/onComplete identity change
  }, [session.isComplete]);

  if (session.isComplete || !session.currentQuestion) return null;

  const hasAnswered = session.chosenIndex !== null || session.mapClickAnswer !== null;

  return (
    <div className="mx-auto w-full max-w-lg">
      <p className="mb-2 text-sm text-muted">
        Question {session.index + 1} of {session.total} — Score: {session.score}
      </p>
      {session.currentQuestion.format === "multiple-choice" ? (
        <MultipleChoiceQuestionView
          question={session.currentQuestion}
          chosenIndex={session.chosenIndex}
          onAnswer={session.answerMultipleChoice}
        />
      ) : (
        <MapClickQuestionView
          question={session.currentQuestion}
          clickedStateId={session.mapClickAnswer}
          onAnswer={session.answerMapClick}
        />
      )}
      {hasAnswered && (
        <button
          onClick={session.next}
          className="mt-4 rounded bg-seal px-4 py-2 text-sm font-medium text-white"
        >
          Next
        </button>
      )}
    </div>
  );
}
