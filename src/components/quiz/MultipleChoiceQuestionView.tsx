import Image from "next/image";
import type { MultipleChoiceQuestion } from "@/lib/quiz/types";
import { PartyBadge } from "@/components/PartyBadge";
import { partyStyle } from "@/lib/party-colors";
import { formatPopulation } from "@/lib/format";
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
        <div className="mb-4">
          <div className="relative h-28 w-full">
            <Image src={question.imageUrl} alt="" fill unoptimized className="object-contain" />
          </div>
          {question.imageCaption && (
            <p className="mt-2 text-center text-sm font-medium text-ink">
              {question.imageCaption}{" "}
              {question.imageCaptionParty !== undefined && (
                <PartyBadge party={question.imageCaptionParty} />
              )}
            </p>
          )}
        </div>
      )}
      <p className="mb-4 text-lg font-medium text-ink">{question.prompt}</p>
      <div className="flex flex-col gap-2">
        {question.options.map((option, i) => {
          const isCorrect = i === question.correctIndex;
          const isChosen = i === chosenIndex;
          let stateClassName = "border-rule text-ink hover:bg-paper";
          const highlighted = answered && (isCorrect || isChosen);
          if (answered && isCorrect) stateClassName = "border-emerald-600 bg-emerald-600 text-white";
          else if (answered && isChosen) stateClassName = "border-red-600 bg-red-600 text-white";
          return (
            <button
              key={option}
              onClick={() => onAnswer(i)}
              disabled={answered}
              className={`flex items-center justify-between gap-2 rounded border px-4 py-2 text-left text-sm ${stateClassName}`}
            >
              <span>
                {option}
                {question.optionsAreParties && (
                  // Inherits the button's own white text once highlighted, rather than the
                  // PartyBadge component's own hardcoded color classes — a party's color badge
                  // (e.g. Republican's red) can otherwise clash against a same-colored highlight
                  // (a wrong-answer red background), so real party colors only show pre-answer.
                  <span
                    className={`font-medium ${highlighted ? "" : partyStyle(option).textClassName}`}
                  >
                    {" "}
                    ({partyStyle(option).letter})
                  </span>
                )}
              </span>
              {answered && question.optionPopulations?.[i] != null && (
                <span className="font-mono text-xs opacity-80">
                  {formatPopulation(question.optionPopulations[i] as number)}
                </span>
              )}
              {answered && isCorrect && <CheckIcon />}
              {answered && isChosen && !isCorrect && <XIcon />}
            </button>
          );
        })}
      </div>
      {answered && question.revealImageUrl && (
        <div className="mt-4 flex items-center gap-3">
          <div className="relative h-16 w-16 shrink-0">
            <Image
              src={question.revealImageUrl}
              alt=""
              fill
              unoptimized
              className="rounded object-cover"
            />
          </div>
          {question.revealCaption && (
            <p className="text-sm font-medium text-ink">{question.revealCaption}</p>
          )}
        </div>
      )}
      {answered && question.revealText && (
        <p className="mt-4 font-mono text-xs text-muted">{question.revealText}</p>
      )}
    </div>
  );
}
