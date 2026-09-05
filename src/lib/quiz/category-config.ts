import type { QuestionFormat } from "./types";

export type QuizCategoryId = "geography" | "officeholders" | "midterms" | "sports" | "mashups";

export type QuizCategoryMeta = {
  id: QuizCategoryId;
  label: string;
  description: string;
  enabled: boolean;
  availableFormats: QuestionFormat[];
};

// Every category the quiz will eventually have — later plans flip `enabled: true` on as each is
// built (same "light up once it exists" convention GlobalHeader's own nav already uses for
// Geography/Quiz). A disabled category's tile still shows on /quiz (as "coming soon"), but its
// /quiz/[category] route 404s if visited directly — see getQuizCategory() below.
export const QUIZ_CATEGORIES: QuizCategoryMeta[] = [
  {
    id: "geography",
    label: "Geography",
    description: "Capitals, flags, and more.",
    enabled: true,
    availableFormats: ["multiple-choice", "map-click", "search-select"],
  },
  {
    id: "officeholders",
    label: "Officeholders",
    description: "Governors and legislators.",
    enabled: true,
    availableFormats: ["multiple-choice", "search-select"],
  },
  {
    id: "midterms",
    label: "2026 Midterms",
    description: "This cycle's candidates.",
    enabled: true,
    availableFormats: ["multiple-choice", "search-select"],
  },
  {
    id: "sports",
    label: "Sports",
    description: "Pro and college teams.",
    enabled: true,
    availableFormats: ["multiple-choice", "search-select"],
  },
  {
    id: "mashups",
    label: "Mashups",
    description: "Mixed-category challenges.",
    enabled: true,
    availableFormats: ["multiple-choice"],
  },
];

export function getQuizCategory(id: string): QuizCategoryMeta | null {
  return QUIZ_CATEGORIES.find((c) => c.id === id && c.enabled) ?? null;
}
