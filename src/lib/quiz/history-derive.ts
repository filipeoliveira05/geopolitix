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

// Every questionType is prefixed with its true owning category (e.g. "geography.capital" ->
// "geography"), which is NOT always the same as the session's own category — Mashups' speed
// round mixes in questions drawn straight from Geography/Officeholders/Midterms/Sports'
// generators, so stamping every row with the outer session category (as an earlier version of
// this function did) produced two separate stats rows for the same question_type under two
// different categories. Deriving it from the question itself is what the per-question-type/
// per-subject accuracy tracking actually wants — "which category does this QUESTION belong to,"
// not "which category page was this session played from."
function categoryFromQuestionType(questionType: string): QuizCategoryId {
  return questionType.split(".")[0] as QuizCategoryId;
}

/**
 * One row per answered SUBJECT, not per answered question — a multi-target search-select
 * question contributes one row per target (found or missed), and a two-way comparison
 * multiple-choice question contributes one row per compared entity, both sharing that question's
 * correct/incorrect outcome. See docs/superpowers/specs/2026-09-08-quiz-history-design.md.
 */
export function deriveAnswerRows(answered: AnsweredQuestion): DerivedAnswerRow[] {
  const category = categoryFromQuestionType(answered.question.questionType);

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

export function deriveSessionAnswerRows(answers: AnsweredQuestion[]): DerivedAnswerRow[] {
  return answers.flatMap((a) => deriveAnswerRows(a));
}
