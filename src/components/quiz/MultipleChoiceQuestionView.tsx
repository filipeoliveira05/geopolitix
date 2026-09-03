import Image from "next/image";
import type { MultipleChoiceQuestion } from "@/lib/quiz/types";
import { CheckIcon, XIcon } from "./icons";

// Solid fills (not a faint tint) so right/wrong is unmistakable at a glance on both light and
// dark themes — an earlier version used `bg-emerald-500/10`/`bg-red-500/10` (a 10% tint over a
// colored border only), which read as barely-there on dark backgrounds. Matches QuizMapClick's
// own already-solid correct/wrong fill treatment for map-click questions.
export function MultipleChoiceQuestionView({
  question,
  chosenIndex,
  onAnswer,
}: {
  question: MultipleChoiceQuestion;
  chosenIndex: number | null;
  onAnswer: (index: number) => void;
}) {
  const answered = chosenIndex !== null;

  return (
    <div>
      {question.imageUrl && (
        <div className="relative mb-4 h-28 w-full">
          <Image src={question.imageUrl} alt="" fill unoptimized className="object-contain" />
        </div>
      )}
      <p className="mb-4 text-lg font-medium text-ink">{question.prompt}</p>
      <div className="flex flex-col gap-2">
        {question.options.map((option, i) => {
          const isCorrect = i === question.correctIndex;
          const isChosen = i === chosenIndex;
          let stateClassName = "border-rule text-ink hover:bg-paper";
          if (answered && isCorrect) stateClassName = "border-emerald-600 bg-emerald-600 text-white";
          else if (answered && isChosen) stateClassName = "border-red-600 bg-red-600 text-white";
          return (
            <button
              key={option}
              onClick={() => onAnswer(i)}
              disabled={answered}
              className={`flex items-center justify-between gap-2 rounded border px-4 py-2 text-left text-sm ${stateClassName}`}
            >
              {option}
              {answered && isCorrect && <CheckIcon />}
              {answered && isChosen && !isCorrect && <XIcon />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
