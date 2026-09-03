// Every quiz question format shares these two shapes — more formats (map-click, matching,
// speed-round) are added to the QuizQuestion union by later plans, not this one.

export type MultipleChoiceQuestion = {
  format: "multiple-choice";
  prompt: string;
  // Shown above the prompt when present — e.g. a state's flag, a legislator's photo. null for a
  // pure-text question (e.g. "What is the capital of Texas?").
  imageUrl: string | null;
  options: string[];
  correctIndex: number;
};

export type QuizQuestion = MultipleChoiceQuestion;

export type AnsweredQuestion = {
  question: MultipleChoiceQuestion;
  chosenIndex: number;
  correct: boolean;
};
