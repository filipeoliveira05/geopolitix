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
  function handleSelectState(abbr: string) {
    if (clickedStateId !== null) return; // already answered
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
        <p className="mt-3 text-sm text-muted">
          {feedback.correct
            ? "Correct!"
            : `Wrong state — ${question.targetStateName} is highlighted in green.`}
        </p>
      )}
    </div>
  );
}
