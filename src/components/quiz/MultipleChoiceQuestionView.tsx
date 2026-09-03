import Image from "next/image";
import type { MultipleChoiceQuestion } from "@/lib/quiz/types";

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
          let stateClassName = "hover:bg-paper";
          if (answered && isCorrect) stateClassName = "border-emerald-500 bg-emerald-500/10";
          else if (answered && isChosen) stateClassName = "border-red-500 bg-red-500/10";
          return (
            <button
              key={option}
              onClick={() => onAnswer(i)}
              disabled={answered}
              className={`rounded border border-rule px-4 py-2 text-left text-sm text-ink ${stateClassName}`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
