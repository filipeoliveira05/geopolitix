"use client";

import { useState } from "react";
import Image from "next/image";
import type { MapClickQuestion } from "@/lib/quiz/types";
import { QuizMapClick, type MapClickFeedback } from "./QuizMapClick";

export function MapClickQuestionView({
  question,
  clickedStateId,
  onAnswer,
}: {
  question: MapClickQuestion;
  clickedStateId: string | null;
  onAnswer: (clickedStateId: string) => void;
}) {
  // Only used for the "you clicked on X" reveal line below — the click event is the only place a
  // human-readable name for the WRONG state a player clicked is available (question only carries
  // the target state's own name, not every state's).
  const [clickedStateName, setClickedStateName] = useState<string | null>(null);

  function handleSelectState(abbr: string, name: string) {
    if (clickedStateId !== null) return; // already answered
    setClickedStateName(name);
    onAnswer(abbr);
  }

  const feedback: MapClickFeedback =
    clickedStateId !== null
      ? {
          clickedStateId,
          targetStateId: question.targetStateId,
          correct: clickedStateId === question.targetStateId,
        }
      : null;

  return (
    <div>
      <p className="mb-4 text-lg font-medium text-ink">{question.prompt}</p>
      <QuizMapClick onSelectState={handleSelectState} feedback={feedback} />
      {feedback && (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink">
            {feedback.correct ? "Correct!" : `Wrong state. You clicked on ${clickedStateName}.`}
          </p>
          <div className="mt-2 flex items-start gap-3">
            <div className="relative h-14 w-24 shrink-0">
              <Image
                src={question.targetFlagUrl}
                alt=""
                fill
                unoptimized
                className="object-contain"
              />
            </div>
            <p className="whitespace-pre-line font-mono text-xs text-muted">
              {question.revealText}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
