// Every quiz question format shares only `prompt` — the rest of each shape is format-specific.
// More formats (matching, speed-round) are added by later plans, not this one.

export type QuestionFormat = "multiple-choice" | "map-click" | "search-select";

export type SearchSelectEntry = { id: string; label: string };

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
  // Shown only AFTER answering, as its own line below the options — same reveal timing as
  // revealImageUrl/revealCaption, but for a question with no image to caption (e.g. the
  // is-largest-city Yes/No question revealing the actual population figures once answered).
  // Deliberately a separate field rather than reusing revealCaption, which the view only renders
  // alongside revealImageUrl — this one has no image at all.
  revealText?: string | null;
  // When true, each option string IS a party name (e.g. "Democrat") — the view renders a
  // "(D)"-style badge next to it. Never inferred from option text alone (a state name or team
  // name option should never accidentally get a badge), so a question type opts in explicitly.
  optionsAreParties?: boolean;
  // Shown next to each option, but only AFTER answering (same reveal timing as
  // revealImageUrl/revealCaption) — the two population-comparison question types' whole point is
  // guessing, so showing this pre-answer would give the answer away. Index-aligned with
  // `options`; a null entry (never expected in practice, since both generators only pair states/
  // cities with a known population) simply shows nothing for that option. Undefined for every
  // other question type.
  optionPopulations?: (number | null)[];
  // Shown only AFTER answering, as a list below the options — e.g. the pro-team-count question
  // revealing the actual synced teams for the asked-about state (name/league/logo each), so
  // guessing a bucket ("0"/"1"/"2"/"3+") still teaches which real teams that state has. An empty
  // array (as opposed to undefined, meaning "this question type has no team list at all") is a
  // real, distinct state — the subject genuinely has zero synced teams — and the view renders an
  // explicit "no teams" message for it rather than nothing.
  revealTeams?: { name: string; league: string; logoUrl: string | null }[];
  options: string[];
  correctIndex: number;
};

export type MapClickQuestion = {
  format: "map-click";
  prompt: string;
  targetStateId: string;
  targetStateName: string;
};

export type SearchSelectQuestion = {
  format: "search-select";
  prompt: string;
  imageUrl: string; // the subject state's flag, always shown for this format
  imageCaption: string; // the subject state's name
  entityType: "city" | "senator" | "candidate" | "team";
  targets: SearchSelectEntry[]; // correct answers, already in slot/display order
  // Only populated for entityType "candidate" — the searchable pool for the other three types is
  // a single shared nationwide index built once per category-pool-fetch
  // (search-select-index.ts), but a candidate's real-world relevance is scoped to one specific
  // race, so its search pool is computed per-question by the generator itself (its own targets
  // plus a handful of real candidates from nearby races) rather than drawn from a shared index.
  searchPool?: SearchSelectEntry[];
};

export type QuizQuestion = MultipleChoiceQuestion | MapClickQuestion | SearchSelectQuestion;

export type AnsweredMultipleChoice = {
  format: "multiple-choice";
  question: MultipleChoiceQuestion;
  chosenIndex: number;
  correct: boolean;
  points: number;
};

export type AnsweredMapClick = {
  format: "map-click";
  question: MapClickQuestion;
  clickedStateId: string;
  correct: boolean;
  points: number;
};

export type AnsweredSearchSelect = {
  format: "search-select";
  question: SearchSelectQuestion;
  foundIds: string[];
  gaveUp: boolean;
  points: number; // 0-10, via searchSelectPoints()
};

export type AnsweredQuestion = AnsweredMultipleChoice | AnsweredMapClick | AnsweredSearchSelect;

// A matching-pairs board isn't a "question" at all (no prompt/answer, just N pairs solved
// together) — deliberately not part of the QuizQuestion union above.
export type MatchingPair = {
  id: string;
  imageUrl: string;
  name: string;
};
