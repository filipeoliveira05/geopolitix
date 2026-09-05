"use client";

import { useEffect } from "react";
import { useQuizSession } from "@/lib/quiz/useQuizSession";
import type { QuizQuestion, AnsweredQuestion, SearchSelectEntry } from "@/lib/quiz/types";
import { createEntitySearch } from "@/lib/quiz/search-select-index";
import { MultipleChoiceQuestionView } from "./MultipleChoiceQuestionView";
import { MapClickQuestionView } from "./MapClickQuestionView";
import { SearchSelectQuestionView } from "./SearchSelectQuestionView";
import { QuizProgressHeader } from "./QuizProgressHeader";

export function QuestionSession({
  questions,
  onComplete,
  sharedSearch,
}: {
  questions: QuizQuestion[];
  onComplete: (answers: AnsweredQuestion[]) => void;
  sharedSearch: ((query: string) => SearchSelectEntry[]) | null;
}) {
  const session = useQuizSession(questions);

  useEffect(() => {
    if (session.isComplete) onComplete(session.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when isComplete flips, not on every answers/onComplete identity change
  }, [session.isComplete]);

  if (session.isComplete || !session.currentQuestion) return null;

  const hasAnswered =
    session.chosenIndex !== null ||
    session.mapClickAnswer !== null ||
    session.searchSelectResult !== null;

  const question = session.currentQuestion;

  return (
    <div className="mx-auto w-full max-w-lg">
      <QuizProgressHeader
        total={session.total}
        currentIndex={session.index}
        answeredCount={session.answers.length}
        score={session.score}
      />
      <div key={session.index} className="animate-fade-in">
        {question.format === "multiple-choice" ? (
          <MultipleChoiceQuestionView
            question={question}
            chosenIndex={session.chosenIndex}
            onAnswer={session.answerMultipleChoice}
          />
        ) : question.format === "map-click" ? (
          <MapClickQuestionView
            question={question}
            clickedStateId={session.mapClickAnswer}
            onAnswer={session.answerMapClick}
          />
        ) : (
          <SearchSelectQuestionView
            question={question}
            result={session.searchSelectResult}
            onAnswer={session.answerSearchSelect}
            search={
              question.entityType === "candidate"
                ? createEntitySearch(question.searchPool ?? [])
                : (sharedSearch ?? (() => []))
            }
          />
        )}
      </div>
      {hasAnswered && (
        <button
          onClick={session.next}
          className="mt-4 animate-pop-in rounded bg-seal px-4 py-2 text-sm font-medium text-white transition-transform hover:scale-105 active:scale-95"
        >
          Next
        </button>
      )}
    </div>
  );
}
