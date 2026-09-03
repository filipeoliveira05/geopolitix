"use client";

import { useEffect } from "react";
import { useQuizSession } from "@/lib/quiz/useQuizSession";
import type { MultipleChoiceQuestion, AnsweredQuestion } from "@/lib/quiz/types";
import { MultipleChoiceQuestionView } from "./MultipleChoiceQuestionView";

export function QuestionSession({
  questions,
  onComplete,
}: {
  questions: MultipleChoiceQuestion[];
  onComplete: (answers: AnsweredQuestion[]) => void;
}) {
  const session = useQuizSession(questions);

  useEffect(() => {
    if (session.isComplete) onComplete(session.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when isComplete flips, not on every answers/onComplete identity change
  }, [session.isComplete]);

  if (session.isComplete || !session.currentQuestion) return null;

  return (
    <div className="mx-auto w-full max-w-lg">
      <p className="mb-2 text-sm text-muted">
        Question {session.index + 1} of {session.total} — Score: {session.score}
      </p>
      <MultipleChoiceQuestionView
        question={session.currentQuestion}
        chosenIndex={session.chosenIndex}
        onAnswer={session.answer}
      />
      {session.chosenIndex !== null && (
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
