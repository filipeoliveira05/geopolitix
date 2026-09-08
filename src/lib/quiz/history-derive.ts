import type { QuizCategoryId } from "./category-config";
import type { AnsweredQuestion } from "./types";

export type DerivedAnswerRow = {
  category: QuizCategoryId;
  questionType: string;
  subjectId: string;
  subjectLabel: string;
  format: "multiple-choice" | "map-click" | "search-select";
  correct: boolean;
  points: number | null;
};

/**
 * One row per answered SUBJECT, not per answered question — a multi-target search-select
 * question contributes one row per target (found or missed), and a two-way comparison
 * multiple-choice question contributes one row per compared entity, both sharing that question's
 * correct/incorrect outcome. See docs/superpowers/specs/2026-09-08-quiz-history-design.md.
 */
export function deriveAnswerRows(
  category: QuizCategoryId,
  answered: AnsweredQuestion,
): DerivedAnswerRow[] {
  if (answered.format === "multiple-choice") {
    return answered.question.subjects.map((s) => ({
      category,
      questionType: answered.question.questionType,
      subjectId: s.id,
      subjectLabel: s.label,
      format: "multiple-choice",
      correct: answered.correct,
      points: answered.points,
    }));
  }

  if (answered.format === "map-click") {
    return [
      {
        category,
        questionType: answered.question.questionType,
        subjectId: answered.question.targetStateId,
        subjectLabel: answered.question.targetStateName,
        format: "map-click",
        correct: answered.correct,
        points: answered.points,
      },
    ];
  }

  return answered.question.targets.map((t) => ({
    category,
    questionType: answered.question.questionType,
    subjectId: t.id,
    subjectLabel: t.label,
    format: "search-select",
    correct: answered.foundIds.includes(t.id),
    points: null,
  }));
}

export function deriveSessionAnswerRows(
  category: QuizCategoryId,
  answers: AnsweredQuestion[],
): DerivedAnswerRow[] {
  return answers.flatMap((a) => deriveAnswerRows(category, a));
}
