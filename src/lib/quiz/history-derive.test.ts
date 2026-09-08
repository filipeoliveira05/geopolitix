import { describe, it, expect } from "vitest";
import { deriveAnswerRows, deriveSessionAnswerRows } from "./history-derive";
import type {
  AnsweredMultipleChoice,
  AnsweredMapClick,
  AnsweredSearchSelect,
  MultipleChoiceQuestion,
  MapClickQuestion,
  SearchSelectQuestion,
} from "./types";

function mcQuestion(overrides: Partial<MultipleChoiceQuestion> = {}): MultipleChoiceQuestion {
  return {
    format: "multiple-choice",
    questionType: "geography.capital",
    subjects: [{ id: "TX", label: "Texas" }],
    prompt: "What is the capital of Texas?",
    imageUrl: null,
    options: ["Austin", "Houston", "Dallas", "San Antonio"],
    correctIndex: 0,
    ...overrides,
  };
}

describe("deriveAnswerRows", () => {
  it("derives one row per subject for a correct multiple-choice answer", () => {
    const answered: AnsweredMultipleChoice = {
      format: "multiple-choice",
      question: mcQuestion(),
      chosenIndex: 0,
      correct: true,
      points: 10,
    };
    const rows = deriveAnswerRows(answered);
    expect(rows).toEqual([
      {
        category: "geography",
        questionType: "geography.capital",
        subjectId: "TX",
        subjectLabel: "Texas",
        format: "multiple-choice",
        correct: true,
        points: 10,
      },
    ]);
  });

  it("derives category from the questionType prefix, not any outer session category — a Mashups speed round mixes in questions built by other categories' own generators, so a geography.* question answered during a mashups session must still be attributed to geography", () => {
    const answered: AnsweredMultipleChoice = {
      format: "multiple-choice",
      question: mcQuestion({ questionType: "sports.team_logo", subjects: [{ id: "T1", label: "Team One" }] }),
      chosenIndex: 0,
      correct: true,
      points: 10,
    };
    const [row] = deriveAnswerRows(answered);
    expect(row.category).toBe("sports");
  });

  it("derives two rows, sharing the same correct flag, for a population-comparison question", () => {
    const answered: AnsweredMultipleChoice = {
      format: "multiple-choice",
      question: mcQuestion({
        questionType: "geography.population_compare_state",
        subjects: [
          { id: "TX", label: "Texas" },
          { id: "WY", label: "Wyoming" },
        ],
      }),
      chosenIndex: 1,
      correct: false,
      points: 0,
    };
    const rows = deriveAnswerRows(answered);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.correct === false)).toBe(true);
    expect(rows.map((r) => r.subjectId)).toEqual(["TX", "WY"]);
  });

  it("derives one row from a map-click answer, using targetStateId/targetStateName", () => {
    const question: MapClickQuestion = {
      format: "map-click",
      questionType: "geography.map_click",
      prompt: "Click on Rhode Island.",
      targetStateId: "RI",
      targetStateName: "Rhode Island",
      targetFlagUrl: "https://example.com/ri.png",
      revealText: "Rhode Island (RI)",
    };
    const answered: AnsweredMapClick = {
      format: "map-click",
      question,
      clickedStateId: "RI",
      correct: true,
      points: 10,
    };
    const rows = deriveAnswerRows(answered);
    expect(rows).toEqual([
      {
        category: "geography",
        questionType: "geography.map_click",
        subjectId: "RI",
        subjectLabel: "Rhode Island",
        format: "map-click",
        correct: true,
        points: 10,
      },
    ]);
  });

  it("derives one row per target for a search-select answer, correctness from foundIds", () => {
    const question: SearchSelectQuestion = {
      format: "search-select",
      questionType: "geography.border_recall",
      prompt: "Name all the states that border Nevada.",
      entityType: "state",
      targets: [
        { id: "CA", label: "California" },
        { id: "OR", label: "Oregon" },
        { id: "AZ", label: "Arizona" },
      ],
    };
    const answered: AnsweredSearchSelect = {
      format: "search-select",
      question,
      foundIds: ["CA", "AZ"],
      gaveUp: true,
      points: 6,
    };
    const rows = deriveAnswerRows(answered);
    expect(rows).toEqual([
      {
        category: "geography",
        questionType: "geography.border_recall",
        subjectId: "CA",
        subjectLabel: "California",
        format: "search-select",
        correct: true,
        points: null,
      },
      {
        category: "geography",
        questionType: "geography.border_recall",
        subjectId: "OR",
        subjectLabel: "Oregon",
        format: "search-select",
        correct: false,
        points: null,
      },
      {
        category: "geography",
        questionType: "geography.border_recall",
        subjectId: "AZ",
        subjectLabel: "Arizona",
        format: "search-select",
        correct: true,
        points: null,
      },
    ]);
  });
});

describe("deriveSessionAnswerRows", () => {
  it("flattens rows across multiple answered questions", () => {
    const a: AnsweredMultipleChoice = {
      format: "multiple-choice",
      question: mcQuestion(),
      chosenIndex: 0,
      correct: true,
      points: 10,
    };
    const b: AnsweredMultipleChoice = {
      format: "multiple-choice",
      question: mcQuestion({ subjects: [{ id: "CA", label: "California" }] }),
      chosenIndex: 1,
      correct: false,
      points: 0,
    };
    const rows = deriveSessionAnswerRows([a, b]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.subjectId)).toEqual(["TX", "CA"]);
  });
});
