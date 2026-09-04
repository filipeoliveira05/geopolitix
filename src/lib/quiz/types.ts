// Every quiz question format shares only `prompt` — the rest of each shape is format-specific.
// More formats (matching, speed-round) are added by later plans, not this one.

export type MultipleChoiceQuestion = {
  format: "multiple-choice";
  prompt: string;
  // Shown above the prompt when present — e.g. a state's flag, a legislator's photo. null for a
  // pure-text question (e.g. "What is the capital of Texas?").
  imageUrl: string | null;
  // Shown under the image when present — e.g. a legislator's name/party. Unused by every other
  // image question type (flags, team logos), which have nothing worth captioning.
  imageCaption?: string | null;
  imageCaptionParty?: string | null;
  options: string[];
  correctIndex: number;
};

export type MapClickQuestion = {
  format: "map-click";
  prompt: string;
  targetStateId: string;
  targetStateName: string;
};

export type QuizQuestion = MultipleChoiceQuestion | MapClickQuestion;

export type AnsweredMultipleChoice = {
  format: "multiple-choice";
  question: MultipleChoiceQuestion;
  chosenIndex: number;
  correct: boolean;
};

export type AnsweredMapClick = {
  format: "map-click";
  question: MapClickQuestion;
  clickedStateId: string;
  correct: boolean;
};

export type AnsweredQuestion = AnsweredMultipleChoice | AnsweredMapClick;

// A matching-pairs board isn't a "question" at all (no prompt/answer, just N pairs solved
// together) — deliberately not part of the QuizQuestion union above.
export type MatchingPair = {
  id: string;
  imageUrl: string;
  name: string;
};
