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
  // Renders a party badge next to imageCaption when present (string or null — null renders the
  // "unknown party" badge). Left undefined (not just falsy) to mean "no party badge at all" —
  // e.g. a midterms candidate caption, where showing a party badge next to the photo would give
  // away the answer to "what party is this candidate running as?".
  imageCaptionParty?: string | null;
  // Shown only AFTER answering, below the options — e.g. the correct governor's own photo, so a
  // text-only question ("Who is the governor of X?") still teaches a face-to-name association.
  // Distinct from imageUrl/imageCaption above, which show BEFORE answering for photo-guess
  // question types (e.g. Legislator) — the two never apply to the same question.
  revealImageUrl?: string | null;
  revealCaption?: string | null;
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
