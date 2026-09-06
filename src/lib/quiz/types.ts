// Every quiz question format shares only `prompt` — the rest of each shape is format-specific.
// More formats (matching, speed-round) are added by later plans, not this one.

export type QuestionFormat = "multiple-choice" | "map-click" | "search-select";

export type SearchSelectEntry = {
  id: string;
  label: string;
  // Populated for entityType "candidate" and "senator" — shown as a party badge next to a found
  // target's name (SearchSelectQuestionView), same PartyBadge component every other party display
  // in this app already uses. Undefined for city/team entries, which have no party.
  party?: string | null;
  // Populated for entityType "candidate" (the candidate's own resolved photo — same legislator >
  // governor > standalone-candidate priority every other candidate photo in this app already
  // uses), "team" (the team's synced logo), and "senator" (the legislator's own synced photo).
  // Shown as a small avatar in the search dropdown and a larger one on a found/revealed slot.
  // Genuinely null for a real candidate/team/senator with no synced photo (falls back to a
  // placeholder icon in the view) — undefined for entityType "city", which has no concept of a
  // photo at all.
  photoUrl?: string | null;
  // Only populated for entityType "team" — the team's league (e.g. "NFL"), shown as small muted
  // text next to the team name in the search dropdown and on a found/revealed slot, same
  // "(League)" convention MultipleChoiceQuestionView's own revealTeams rows already use. Undefined
  // for every other entityType, which has no concept of a league.
  league?: string;
  // Only populated on a city-recall question's own `targets` entries (never on the shared
  // search-pool entries a player searches against, which would spoil the "top cities" ranking
  // before it's found) — shown next to a found/revealed target's name once its row is actually
  // revealed, same reveal timing SearchSelectQuestionView already gates photo/party on.
  population?: number | null;
  // Only populated on the race-candidate-recall question's own `targets` entries (never on
  // searchPool entries, same not-in-the-dropdown reasoning as population above, though here it's
  // simply not relevant there rather than a spoiler) — a small "(Incumbent)" tag shown next to a
  // found/revealed target's name.
  isIncumbent?: boolean;
};

export type MultipleChoiceQuestion = {
  format: "multiple-choice";
  prompt: string;
  // Shown above the prompt when present — e.g. a state's flag, a legislator's photo. null for a
  // pure-text question (e.g. "What is the capital of Texas?").
  imageUrl: string | null;
  // An SVG path `d` string (already fit/centered to a square viewBox by state-silhouette-geo.ts)
  // rendered as an inline vector shape instead of a raster image — its fill can then follow the
  // ink/paper theme tokens rather than being a static-colored image, unlike every other image
  // question type here (flags, photos, logos), which are always real raster images. Mutually
  // exclusive with imageUrl — a question sets exactly one of the two, never both. Only populated
  // for the silhouette-guess question type.
  silhouettePath?: string;
  // When true, the image renders AFTER the prompt (question text first, then image, then
  // options) instead of the default before-prompt placement — for a question type whose prompt
  // already names the subject in text (e.g. "What is the capital of Virginia?") and the image is
  // a supplementary illustration, not the clue itself (unlike e.g. the flag-guess question, where
  // showing the flag first IS the question).
  imageBelowPrompt?: boolean;
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
  // Shown next to each option, always (not gated by answering, unlike optionPopulations above) —
  // a party badge doesn't hand the player the answer the way a population figure would, so there's
  // no reason to hide it pre-answer. Index-aligned with `options`; a null entry renders the
  // "unknown party" badge (same imageCaptionParty convention), while the field being entirely
  // undefined means this question type has no concept of party at all.
  optionParties?: (string | null)[];
  // Shown next to each option, always (same non-gated reasoning as optionParties — a photo of a
  // person doesn't hand the player their name the way a population figure would give away a
  // biggest/smallest comparison). Index-aligned with `options`; a null entry renders no avatar for
  // that option (e.g. a governor with no synced photo). Undefined means this question type has no
  // per-option photo at all.
  optionImages?: (string | null)[];
  // When true, optionImages renders as a square object-contain box instead of the default circular
  // object-cover crop — for a question type whose optionImages are team logos (e.g. the odd-one-out
  // question), not people's photos. A circular crop cuts off a horizontally-wide logo's edges (a
  // real bug caught on the Rams' logo elsewhere in this app); a photo has no such problem since a
  // headshot is already roughly square. Undefined/false means the default circular photo crop.
  optionImagesAreLogos?: boolean;
  // Shown next to each option's text as ", XX", but only AFTER answering (same reveal timing as
  // optionPopulations above) — the capital question's whole point is guessing, so naming each
  // option's real state up front would give it away. Lets a player who got it wrong see exactly
  // which real state they mixed the capital up with. Index-aligned with `options`; undefined means
  // this question type has no per-option state to reveal.
  optionStateAbbrs?: (string | null)[];
  // Renders a party badge next to revealCaption, same imageCaptionParty convention. Undefined
  // means no badge; a question type with no party concept simply never sets it.
  revealCaptionParty?: string | null;
  // Shown only AFTER answering, as a list below the options — e.g. the pro-team-count question
  // revealing the actual synced teams for the asked-about state (name/league/logo each), so
  // guessing a bucket ("0"/"1"/"2"/"3+") still teaches which real teams that state has. An empty
  // array (as opposed to undefined, meaning "this question type has no team list at all") is a
  // real, distinct state — the subject genuinely has zero synced teams — and the view renders an
  // explicit "no teams" message for it rather than nothing.
  revealTeams?: { name: string; league: string; logoUrl: string | null }[];
  // Only populated for the incumbency question — every real candidate in the subject's own race
  // (photo/name/party/incumbent status each), shown after answering so a wrong "No" guess (or a
  // right one) still teaches the race's full lineup, not just a one-line fact. Same reveal-timing
  // convention as revealTeams above, just for people instead of teams.
  revealCandidates?: { name: string; party: string; photoUrl: string | null; isIncumbent: boolean }[];
  // Only populated for the does-NOT-border question type — same precomputed regional-map shape
  // SearchSelectQuestion.revealBorderMap uses (state-border-region-geo.ts), shown after answering
  // so the player sees which states actually do border the subject. Unlike the search-select
  // version there's no found/missed distinction to color (nothing here was "found" one at a time),
  // so every real neighbor renders with the same highlight.
  revealBorderMap?: {
    subject: { label: string; path: string; labelX: number; labelY: number };
    neighbors: { id: string; label: string; path: string; labelX: number; labelY: number }[];
  };
  options: string[];
  correctIndex: number;
};

export type MapClickQuestion = {
  format: "map-click";
  prompt: string;
  targetStateId: string;
  targetStateName: string;
  // Shown next to the reveal facts below — the target state's own flag, same visual reinforcement
  // every other Geography question type already gives its subject.
  targetFlagUrl: string;
  // Shown after answering (right or wrong), one fact per line (\n-joined, rendered with
  // whitespace-pre-line) — the state's name/abbreviation, capital, and population, reinforcing
  // recall beyond just "that was/wasn't it". The "wrong state, you clicked on X" line is NOT part
  // of this — that names the clicked state, which is only known at answer time, not question-build
  // time, so the view derives it itself from the click event's own state name.
  revealText: string;
};

export type SearchSelectQuestion = {
  format: "search-select";
  prompt: string;
  // The subject state's flag, always shown for this format when present — no caption below it
  // naming the state, since the prompt text already names it (e.g. "Name the top cities in
  // Vermont.") — unlike MultipleChoiceQuestion's imageCaption, which exists for question types
  // whose prompt never names the subject. Mutually exclusive with silhouettePath below — a
  // question sets exactly one of the two. Optional (not just nullable) because a silhouette
  // question sets silhouettePath instead and has no flag URL to speak of at all.
  imageUrl?: string;
  // See MultipleChoiceQuestion.silhouettePath — same inline theme-aware vector shape, used here
  // for the border-recall question type (state borders read more naturally off a shape than a
  // flag). Undefined for every entityType that shows a flag instead.
  silhouettePath?: string;
  entityType: "city" | "senator" | "candidate" | "team" | "state";
  targets: SearchSelectEntry[]; // correct answers, already in slot/display order
  // Only populated for entityType "candidate" — the searchable pool for the other three types is
  // a single shared nationwide index built once per category-pool-fetch
  // (search-select-index.ts), but a candidate's real-world relevance is scoped to one specific
  // race, so its search pool is computed per-question by the generator itself (its own targets
  // plus a handful of real candidates from nearby races) rather than drawn from a shared index.
  searchPool?: SearchSelectEntry[];
  // Only populated for the border-recall question type — precomputed shape/position data
  // (state-border-region-geo.ts) for a post-answer regional map reveal: the subject plus every
  // real neighbor, all fit into ONE shared coordinate space so they land in their correct
  // position relative to each other (unlike the single, independently-fit shape `silhouettePath`
  // shows before answering). Geometry only — found/missed coloring isn't baked in here since that
  // depends on the player's own answer, not anything precomputable at question-build time; the
  // view cross-references each neighbor's `id` against the answered result's foundIds instead.
  revealBorderMap?: {
    subject: { label: string; path: string; labelX: number; labelY: number };
    neighbors: { id: string; label: string; path: string; labelX: number; labelY: number }[];
  };
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
