# Quiz Notes (Phase 3)

Full quiz architecture and every category's question-type batch writeup — referenced from
`CLAUDE.md`'s Status section, not duplicated there. Read before adding a new question type
or touching `src/lib/quiz/*`/`src/components/quiz/*`.

**`/quiz`, `/quiz/[category]`** (Phase 3, added 2026-09-03 across 5 incremental plans): five
category tiles (Geography, Officeholders, 2026 Midterms, Sports, Mashups), each either a real
`/quiz/[category]` link or a disabled "coming soon" tile depending on `QUIZ_CATEGORIES[].enabled`
in `src/lib/quiz/category-config.ts` — `getQuizCategory()` 404s a disabled category's route
directly, not just hides its hub tile, so there was never a moment where a not-yet-built category
was reachable by URL. All 5 are now `enabled: true` — the full v1 scope from the design spec is
shipped. No new Supabase tables or sync scripts: every question generator reads through the
existing `*-data.ts` query helpers (`geography-data.ts`, `governors-data.ts`,
`legislators-data.ts`, `races-data.ts`) the rest of the app already uses.

**Architecture, established in Plan 1 and extended by every later plan without changing its
shape:** a `QuizQuestion` discriminated union (`src/lib/quiz/types.ts`) — `MultipleChoiceQuestion`
(prompt/optional image/options/correctIndex, plus the optional caption/reveal/party-badge fields
added in the 2026-09-04 pass below) and `MapClickQuestion` (prompt/target state, added
Plan 3) — plus a parallel `AnsweredQuestion` union recording what was actually clicked. A
category's full data pool is fetched once per page visit (`fetchCategoryPool()` in
`src/lib/quiz/engine.ts`, cached by TanStack Query's own `["quiz-pool", categoryId]` key) and
turned into a 10-question session (`SESSION_LENGTH`) by `buildCategorySession()` — a plain switch
dispatching to each category's own generators in `src/lib/quiz/*-questions.ts`.
`QuizCategoryClient.tsx` is the one state machine every category's start/session/results (and,
where applicable, matching/speed-round) phases flow through — a `Phase` discriminated union
switched in one component, not a router-per-phase design, since every phase is client-only
interaction with no need for its own URL. **Vitest, introduced in Plan 1, is scoped ONLY to pure
functions in `src/lib/quiz/*`** (question generators, `pickRandom`, `best-score.ts`'s key logic)
— hooks/components/anything touching Supabase stay out of its scope, consistent with this app's
existing "verify UI live in a browser, don't try to unit-test it" philosophy. `vitest.config.mts`
needed its own explicit `resolve.alias` for `@/*` (Vite does not read `tsconfig.json`'s `paths` on
its own) — caught live in Plan 4 once the first REAL (value, not type-only) `@/lib/*` import in a
test file failed to resolve; every earlier test had only ever imported types from that alias,
which are erased before bundling and never actually needed resolving.

**Question option counts are NOT fixed at 4 everywhere** — `buildMultipleChoiceQuestion()`'s
`optionCount` param (default 4) lets a question type whose real answer space has fewer distinct
values ask a smaller, honest question instead of forcing a doomed 4-option question that can never
find enough real distractors. Added in Plan 2 at the user's own explicit suggestion ("can't we
just allow multiple choice questions with just two options? this way we could ask the question
what party is this candidate") after an initial true/false-format proposal was rejected — party
questions use however many distinct real party values exist in the pool (2, occasionally 3, capped
at 4); incumbency questions are a plain hardcoded Yes/No, bypassing `buildMultipleChoiceQuestion`
entirely since `isIncumbent` is already boolean with no pool-based distractor to pick.

**Five categories, each a mix of question types:**
- **Geography** (`geography-questions.ts`): capital-name MC, state-flag-image MC, and
  **map-click** ("Click on {state}.") — the one format that isn't multiple choice at all. Grew to
  10 question types total in a 2026-09-04 same-day follow-up session (name↔abbreviation,
  city→state, largest-city, is-capital, is-largest-city, and state/city population comparisons)
  — see the "Geography new-question-types batch" entry near the end of this section for the full
  writeup, including a real PostgREST ambiguous-FK bug it caught.
  `QuizMapClick.tsx` renders its own dedicated MapLibre instance (own worker-URL fix reusing
  `scripts/copy-maplibre-worker.mjs`'s existing copy, own Alaska/Hawaii inset remapping, same
  `UsMap.tsx` gotchas but a separate component, not a shared one, since gameplay interaction —
  click-to-answer plus red/green feedback highlighting via `setFeatureState` — has nothing in
  common with the main map's mode-toggle/side-panel design). **Two real bugs caught live in Plan
  3, both Strict-Mode-shaped:** the feedback-highlighting effect's cleanup called
  `map.setFeatureState` on an already-`.remove()`'d map instance during unmount (fixed with a
  `removedRef` guard checked before that cleanup runs); that guard itself was then never reset on
  remount, so React 19 dev Strict Mode's mount→cleanup→mount double-invoke left it permanently
  `true` after the very first cycle, silently no-oping every real cleanup thereafter — confirmed
  live via every map-click question after the first leaving its red/green coloring stuck from the
  previous question. Fixed by resetting `removedRef.current = false` at the top of the mount
  effect's body, not just setting it in the cleanup — verify live, don't assume a guard ref
  behaves the same across Strict Mode's synthetic double-invoke as it would in a single real
  mount.
- **Officeholders** (`officeholders-questions.ts`): "who is the current governor of X" MC (photo
  reveal added 2026-09-04, see below). Grew to 6 question types total in a 2026-09-04 same-day
  follow-up session (state-guess, party-guess, combined-clue name-guess, chamber-guess, House
  seat count) — see the "Officeholders new-question-types batch" entry near the end of this
  section for the full writeup, including the wording bug caught from live user feedback.
- **2026 Midterms** (`midterms-questions.ts`): candidate-party MC (the 2-3-option case above) and
  incumbency Yes/No, both naming the specific race as of 2026-09-04 (see below). Draws only from
  Senate + Governor races (`getSenateAndGovernorRaces()`) — House's 435 races are deliberately
  excluded from the quiz pool, an accepted scope gap (a much heavier fetch than the cheap
  count-only query `getHouseRaceCountsByState()` uses elsewhere), not a bug; revisit only if asked.
  `candidateFactsFromRaces()` flattens every race's candidates into one flat pool, skipping
  Wikipedia's own "TBD"/"(presumptive)" placeholder names (same check `races-data.ts`'s
  `isPrimaryPending()` already uses at the race level) and any candidate with no known party —
  both question types need a real name and a real party.
- **Sports** (`sports-questions.ts`, Plan 4; grew from 2 to 9 question types in a 2026-09-04
  same-day follow-up session, see the "Sports new-question-types batch" entry near the end of
  this section for the full writeup): team-logo MC ("which team is this?" — now also mixes in
  power-conference college programs, guessed by school name), team-state MC (shows the team's
  logo immediately as of 2026-09-04, see below), team-league MC ("which league does the {team}
  play in?"), team-city MC ("which city is the {team} based in?"), team-by-city/team-by-state MC
  (reverse direction — "which of these teams is based in {city/state}?"), school-from-nickname MC
  ("which school's team is called the {nickname}?"), college-conference MC ("which conference
  does {school} play in?" — the last two restricted to power-conference programs only, see
  below), and pro-team-count ("how many pro sports teams does {state} have?", bucketed 0/1/2/3+,
  revealing every real team for that state after answering). Draws from `sports_teams` (pro
  leagues) plus, for the college-specific question types only,
  `college_football_programs`/`college_basketball_programs` restricted to the nationally
  recognizable power conferences (Big Ten/SEC/ACC/Big 12, plus Big East for basketball) — see
  below for why the full 503-program pool isn't used wholesale. Plus a second,
  entirely separate session type — **matching-pairs**
  (`MatchingSession.tsx`, `categoryHasMatchingMode()`/`buildMatchingBoard()` in `engine.ts`):
  click a logo, click a name, get an immediate correct/flash-red-then-clear-selection result, no
  question/answer/score shape at all (deliberately not part of the `QuizQuestion` union — see
  `types.ts`'s own comment). Its own results screen (`MatchingResultsScreen.tsx`, mistakes-based,
  fewer-is-better) and its own localStorage best-score key prefix
  (`getBestMatching`/`updateBestMatchingIfLower` in `best-score.ts`), separate from the regular
  round's score-based one — a mistake count and a score aren't comparable, so sharing a key would
  corrupt one or the other's "best."
- **Mashups** (`mashups-questions.ts`, Plan 5, the last category to ship): **odd-one-out** MC
  ("which of these teams is NOT based in the same state as the others?" — 3 sports teams sharing a
  state plus one from elsewhere, genuinely different distractor logic from every other generator,
  which all assume a single designated subject plus random same-pool distractors), and a second
  session type — **speed round** (`SpeedRoundSession.tsx`, `categoryHasSpeedRoundMode()`/
  `buildSpeedRoundPool()` in `engine.ts`): a 60-second countdown pulling ~5 questions from every
  one of the 26 existing multiple-choice generators across Geography/Officeholders/Midterms/Sports
  (up from 19 once Sports grew from 2 to 9 question types, see the "Sports new-question-types
  batch" entry below; deliberately excluding map-click, unsuited to rapid-fire pace, and matching,
  not a `QuizQuestion` at all) shuffled into one ~40-question pool, answered with immediate
  feedback and a 400ms auto-advance — no manual "Next" click, the one session type where that's true. Its own
  results screen (`SpeedRoundResultsScreen.tsx`) and its own best-score key prefix
  (`getBestSpeedRound`/`updateBestSpeedRoundIfHigher`, `geopolitix:quiz-speed-best:*`) — a speed
  round's score (routinely 15-30+ across its larger pool) isn't comparable to the regular
  10-question round's max of 10, so, same reasoning as Matching above, sharing a key would corrupt
  one or the other's "best." **One real bug caught live during Plan 5's own verification, not
  theoretical:** the 60-second countdown's `setInterval` callback called `onComplete` (the parent
  `QuizCategoryClient`'s `setPhase`) from *inside* `setSecondsLeft`'s functional updater — a state
  updater is supposed to be a pure calculation of the next value, and calling a different
  component's setState from within one is a genuine React rules-of-hooks violation, not just a
  style nit: it surfaced as both the literal console warning ("Cannot update a component while
  rendering a different component") AND an actually-premature round end in one real Playwright
  run. (A second, separate "ends after only 2 answers" reading during debugging turned out to be a
  false positive from the verification script's own `.textContent()` call auto-waiting ~30s for a
  not-yet-existent element each iteration, not a product bug — worth remembering as its own
  lesson: an unexpectedly-early "done" signal during verification needs the same live-recheck
  discipline as any other surprising result, since the test harness itself can be the actual bug.)
  Fixed by moving the completion check into its own effect that reacts to `secondsLeft` hitting 0,
  leaving the interval's updater to only ever compute the next second count.

**Best-score persistence is entirely `localStorage`, no auth/Supabase** (Plan 1 design decision,
`src/lib/quiz/best-score.ts`) — three independent shapes under three key-prefix families, exactly
because a score, a mistake-count, and a speed-round score are not comparable to each other:
regular rounds (`geopolitix:quiz-best:{category}:{stateAbbr|"any"}` — the `stateAbbr` slot exists
for a possible future per-state narrowing mode, unused by any category today), matching
(`geopolitix:quiz-matching-best:{category}`), speed round
(`geopolitix:quiz-speed-best:{category}`). Every write is a "write only if it beats the existing
best" pattern (`updateBestScoreIfHigher`/`updateBestMatchingIfLower`/
`updateBestSpeedRoundIfHigher`), wrapped in try/catch and returning `null` on any failure (private
browsing, blocked storage, corrupt JSON) — a best-score note is decorative, never something that
should block play, same philosophy as this app's sync-freshness notes elsewhere in this doc.

**v1 UX polish pass (2026-09-03, driven by the user's first real on-phone testing of Geography)**
— every fix below applies to every category, not just the one actually tested, since all of them
share the same generators/screens:
- **Randomized question mix and order** — `buildCategorySession()` previously split
  `SESSION_LENGTH` into fixed even/thirds counts per generator and concatenated the blocks in a
  fixed order (Geography always ran exactly 3 capital, then 3 flag, then 4 map-click questions,
  every session) — an obviously hardcoded pattern to a repeat player. `randomSplit()` (`random.ts`)
  now randomizes each generator's count per session (a random composition of `SESSION_LENGTH`,
  every part ≥1), and the combined array is shuffled (`pickRandom(qs, qs.length)`, the same
  full-shuffle idiom `buildSpeedRoundPool()` already used below it) before being returned.
- **Multiple-choice feedback strengthened** — `MultipleChoiceQuestionView`'s right/wrong
  highlighting was a 10%-opacity tint over a colored border, hard to see especially in dark mode;
  now a solid emerald/red fill with a check/x icon (`src/components/quiz/icons.tsx`, shared with
  the results screen below).
- **Results screen redesigned** (`QuizResultsScreen.tsx`) — score is now a big `font-display`
  number colored by percentage tier (emerald ≥80%, amber 50-79%, red <50%; the same tier-color
  pairs `StatePanel`/`UsMap` already use elsewhere in the app, not new tokens), with a "New best!"
  tag shown only when a session actually beats a PRIOR best — read before the
  `updateBestScoreIfHigher` call, not after, so someone's very first-ever play (which trivially
  "sets" a best with nothing to have beaten) doesn't claim one. Missed questions moved into a
  `Card`, each row given a uniform-size thumbnail/`MapPinIcon` slot (an earlier pass left a bare,
  unwrapped icon next to a full-size thumbnail box, so rows visibly jumped in width depending on
  which one showed) and prompt+answer stacked as two deliberate lines rather than one inline text
  run that wrapped inconsistently depending on prompt length; the leading x icon is vertically
  centered against that slot, not the row's first text line. A missed map-click row shows "You
  clicked {state}." instead of repeating the target state its own prompt already names ("Click on
  Rhode Island." followed by "✓ Rhode Island" was pure redundancy there — unlike a multiple-choice
  miss, whose prompt never reveals the answer).
- **Start screen redesigned** (`QuizStartScreen.tsx`) — wrapped in a `Card` with a per-category
  icon (`category-icons.tsx`: globe/landmark/ballot-box/trophy/shuffle, hand-drawn SVGs matching
  this app's existing icon convention, not a library) and, when one exists, a plain "Best: X/Y"
  line read from the same `best-score.ts` data the results screen uses — was previously a bare
  title/description/buttons with a lot of unused space. The ballot-box icon needed a redraw after
  its first version (a box with a curved strap on top) read as a shopping bag, not a ballot box —
  caught from an actual screenshot, not assumed correct from the path data alone.
- **Haptics on wrong answers** (`src/lib/quiz/haptics.ts`'s `vibrateWrongAnswer()`) —
  `navigator.vibrate(120)` fires on any wrong answer across the regular round (both
  multiple-choice and map-click, via `useQuizSession.ts`), speed round, and matching mismatches.
  Android Chrome only — iOS Safari doesn't expose the Vibration API to web pages at all, so it's a
  silent no-op there, not a gap to fix; confirmed live (Android Chrome device) as a real 120ms
  buzz on a wrong answer.

**Per-category polish pass (2026-09-04)** — driven by the user manually reviewing Officeholders/
Midterms/Sports one category at a time (rather than another blanket sweep like the v1 pass above),
so each fix below is scoped to the one category it names, not shared automatically the way the v1
pass's fixes were. Added three new optional `MultipleChoiceQuestion` fields (`types.ts`) and their
`build-multiple-choice.ts`/`MultipleChoiceQuestionView.tsx` plumbing, all opt-in per question type
via `buildMultipleChoiceQuestion()`'s new `getImageCaption`/`getImageCaptionParty`/
`getRevealImageUrl`/`getRevealCaption`/`optionsAreParties` opts:
- **`imageCaption`/`imageCaptionParty`** — text (and, optionally, a `PartyBadge`) shown under an
  already-present pre-answer `imageUrl`. `imageCaptionParty` is `undefined` (not just falsy) to
  mean "no party badge at all", distinct from `null` (renders the badge in its "unknown party"
  state) — needed once a second caption consumer (Midterms' candidate photo, see below) had to
  suppress the badge entirely rather than show an unknown-party placeholder next to it.
- **`revealImageUrl`/`revealCaption`** — a photo+name shown only AFTER answering, below the
  options, for a question whose prompt already *asks* for the subject's identity (the governor
  question below) rather than showing it — as opposed to `imageUrl`/`imageCaption` above, which
  show BEFORE answering for a question that already reveals the subject in its prompt text.
- **`optionsAreParties`** — flags that every option string IS a party name, so
  `MultipleChoiceQuestionView` renders each one with the app's existing `partyStyle()`-colored
  "(D)"/"(R)"/"(I)" badge instead of plain text. Once answered, a highlighted (green/red) option's
  badge inherits the button's own white text rather than `partyStyle()`'s color, to avoid a
  same-hue clash (e.g. a red "(R)" badge on a red wrong-answer background) — confirmed live in both
  themes.

**Officeholders** (`officeholders-questions.ts`):
- `buildLegislatorPhotoQuestions`'s prompt was a bare "Which state does this legislator
  represent?" with only a photo and no name — genuinely too vague to learn a face-to-name
  association from. Now shows the legislator's name + `PartyBadge` as an `imageCaption` under the
  photo, and the prompt itself is chamber-aware: `` `Which state is this
  ${chamber === "senate" ? "senator" : "representative"} from?` `` (`LegislatorStateFact` gained
  `legislatorName`/`party`/`chamber`, sourced from an extended `getAllCurrentLegislatorsWithPhoto()`
  query in `legislators-data.ts`). Went through two wording iterations, both from direct user
  feedback: "Which state does this representative represent?" read as repetitive (the noun and verb
  share a root), landing on "Which state is this representative from?" instead — picked over
  "...serve?"/"...elected this representative?" alternatives.
- `buildGovernorQuestions` was pure text — a governor question, right or wrong, taught nothing
  about what that governor actually looks like. Now reveals the CORRECT governor's photo/name
  (`revealImageUrl`/`revealCaption`) below the options once answered, regardless of which option
  was chosen — deliberately not the option the player picked, since the value here is a face-to-
  name association with the officeholder, not a labeled wrong answer (`GovernorFact` gained
  `photoUrl`, sourced from an extended `getAllCurrentGovernors()` query in `governors-data.ts`).

**2026 Midterms** (`midterms-questions.ts`):
- `buildIncumbencyQuestions`'s prompt — "Is X the incumbent in this race?" — never actually named
  the race, making it genuinely unanswerable rather than a real question (a real, not cosmetic,
  correctness gap). Fixed with a new `raceLabel()` helper: `"{state} Senate"` /
  `"{state} Governor"` / `"{state} House"` (at-large) / `"{state} House District {n}"` (numbered),
  producing e.g. "Is X the incumbent in the Texas House District 3 race?". Applied to
  `buildCandidatePartyQuestions`'s prompt too for consistency ("What party is X running as in the
  {race} race?"), at the user's own follow-up request once the asymmetry was pointed out.
  `CandidateFact` gained `stateName`/`office`/`districtNumber`, sourced from the `Race` the
  candidate's row came from (`candidateFactsFromRaces()`).
- Both question types now show the candidate's photo — via `imageUrl`/`imageCaption` (shown
  immediately, not `revealImageUrl`), since the candidate's name is already right in the prompt for
  both, so unlike the governor question above there's nothing left to spoil by showing it up front.
  Required resolving a photo through whichever of `legislators`/`governors`/`candidates` a
  `race_candidates` row is matched to (same priority order `candidateHref()` already uses) — added
  as nested embeds (`matched_legislator:legislators(photo_url)`, etc.) to the shared
  `RACE_WITH_CANDIDATES_SELECT` in `races-data.ts`, so every existing consumer of the races queries
  gets `RaceCandidate.photoUrl` for free, not just the quiz. The party question's caption
  deliberately omits `imageCaptionParty` (would spoil "what party is X running as?"); the
  incumbency question's caption includes it (incumbency isn't derivable from party, so it's safe —
  confirmed live: a wrong-picked option's badge and a correct one's both render correctly).
- `buildCandidatePartyQuestions` sets `optionsAreParties: true` — the "Democrat"/"Republican"/
  "Independent" options now show the colored `(D)`/`(R)`/`(I)` badge described above, at the user's
  explicit request after seeing the plain-text version live.

**Sports** (`sports-questions.ts`): `buildTeamStateQuestions` ("Which state is the {team} based
in?") showed no image at all despite the team name already being in the prompt and `logoUrl`
sitting right there on `SportsTeam` — added as `imageUrl` (shown immediately, no spoiler risk),
with no `imageCaption` since the team name is already in the prompt text (unlike the Legislator
question, whose prompt never names its subject) — a redundant caption was caught and removed after
an initial version included one. Verified no real name-collision risk first (unlike a hypothetical
"Giants" NFL/MLB ambiguity) — live data check confirmed every one of the 172 synced teams has a
unique full "City Mascot" name, so no `raceLabel()`-style disambiguation was needed here.

**Bug, caught and fixed while polishing Sports**: `QuizStartScreen`'s "Best: X/Y" line read
`localStorage` via a lazy `useState` initializer, on the (incorrect) assumption in its own comment
that this screen — unlike the results screens — never faces a real SSR pass. It actually IS the
default phase of `/quiz/[category]`, so it genuinely is server-rendered, and the initializer
produced a different value server-side (no `localStorage`, caught, returns `null`) than on client
hydration (the real value) whenever a best score already existed — confirmed live via a real
"Hydration failed" error, reproduced consistently with a fresh page load against a pre-populated
`localStorage`. Fixed with `useSyncExternalStore` (React's correct primitive for reading an
external store safely across SSR/hydration), which exposed a second bug along the way: calling
`getBestScore()` directly as `getSnapshot` returns a freshly-`JSON.parse`d object every call, which
React reads as "always changing" and threw into an infinite render loop ("Maximum update depth
exceeded", also confirmed live) — fixed with a per-mount cached snapshot, correct here specifically
because this screen is always a fresh mount when it appears (`QuizCategoryClient`'s phase switch
renders a different component type for every other phase, so returning to "start" unmounts and
remounts this component rather than just re-rendering it).

**Investigated and deliberately NOT changed**: Mashups' speed round (400ms auto-advance) was
suspected to cut off the governor question's `revealImageUrl` before it could load — checked live
via screenshots at 100ms/350ms into the window, and the photo actually rendered well within it, so
no fix was needed. Also checked the Matching-pairs component and odd-one-out generator for the same
class of gaps found elsewhere in this pass — neither had one.

**Geography new-question-types batch (2026-09-04, same-day follow-up)** — driven by the user's
own hand-written list of question-type ideas, worked through one at a time in ease order (an
initial ease analysis ranked "pure MC reuse, no new data" ideas first). Six new generators shipped
in `geography-questions.ts`, taking Geography from 3 question types to 10 — exactly
`SESSION_LENGTH`, so `randomSplit` now gives precisely 1 question per type per round (no more
session-to-session mix variety in composition, only in which instance/order — a deliberate
tradeoff the user chose over bumping `SESSION_LENGTH`, see `buildCategorySession`'s own comment).
- **`buildAbbreviationQuestions`** — name↔abbreviation, direction randomized per question
  ("What is the abbreviation for X?" / "Which state has the abbreviation Y?"). Needed zero new
  data — `StateFact.stateId` already holds the USPS abbreviation.
- **`buildCityStateQuestions`** — "Which state is this city in?", needing a new
  `getAllCitiesWithState()` query/`CityFact` type in `geography-data.ts`. **Caught a real,
  not-hypothetical PostgREST bug**: the `cities` → `states` embed needs explicit FK
  disambiguation (`states!cities_state_id_fkey(name)`, not the bare table name) — same class of
  gotcha `race_candidates` already has documented above, but a fresh instance here: `cities` and
  `states` have TWO FKs between them (`cities.state_id → states.id`, and the reverse
  `states.capital_city_id → cities.id`), so the bare embed is ambiguous. The real failure mode is
  worse than a normal API error, though — PostgREST returns an HTTP 300, which `supabase-js`
  doesn't surface as a thrown error at all, so the query promise just never resolves. Confirmed
  live as a permanently-stuck "Loading…" screen with zero console error; only visible by watching
  the actual network response.
- **`buildLargestCityQuestions`** — "What is the largest city in X?" (distinct from the capital —
  Austin vs. Houston is the canonical example). First version drew distractors from OTHER
  states' largest cities (nationwide dedup pool, same pattern every other MC generator uses); the
  user pushed back live ("I would rather have the other three options also cities from that
  state... also add the state's flag") since a wrong-state city is too easy a tell — reworked to
  draw all 4 options from real cities in the SAME state (`largestCityPerState()` groups by state,
  keeps every other synced city as the distractor pool) plus the state's flag as `imageUrl`.
- **`buildIsCapitalQuestions`** — "Is X the capital of Y?" Yes/No, needing a new
  `CityFact.isCapital` field. For a random eligible state, 50/50 between the real capital (Yes)
  and a random non-capital city (No) — a uniform random city pick would skew heavily toward "No"
  (~10 non-capitals synced per 1 capital per state). Flag added the same way as above, at the same
  user request (it applied to "every future Yes/No-style question," not just one).
- **`buildIsLargestCityQuestions`** — originally shipped as "Is the capital ALSO the largest city
  in Y?" (`buildCapitalIsLargestQuestions`, reusing `CityFact.isCapital`/`.population`, no new
  data). **Reworded after live feedback**: naming the capital in the prompt without the prompt
  ever saying it's the capital made the "also" read as unearned context. Redesigned as a plain
  "Is X the largest city in Y?" — for a random eligible state, 50/50 between the real largest
  city (Yes) and a random other synced city (No); works identically whether or not the picked
  city happens to be the capital, so the phrasing never needs "also" or any capital framing.
  `citiesByState`/flag-lookup logic was factored into shared `groupCitiesByState()`/
  `flagUrlByState()` helpers once a third generator needed the identical grouping.
- **`buildStatePopulationQuestions`/`buildCityPopulationQuestions`** — "Which state/city has a
  higher population?", a genuinely different question SHAPE from every generator above: the two
  options ARE the two entities being compared, not a correct answer plus unrelated distractors,
  so both bypass `buildMultipleChoiceQuestion` entirely (same reasoning the Yes/No generators
  already use). Needed a new `StateFact.population` field (states.population was already synced
  but the bulk `getAllStateCapitalsAndFlags()` query didn't select it). City options are labeled
  `"{cityName}, {stateId}"`, not the bare city name — multiple cities share a name across
  different states in the synced pool (several "Portland"s, etc.), so a bare name risked either
  ambiguous or literally-identical-text options for two different real cities. Both generators
  explicitly exclude same-population pairs from ever being paired together (`population !==`
  comparison when building the "others" candidate pool), so there's never an unanswerable tie.
- **Post-answer population reveal** (added right after both shipped, at the user's follow-up
  request) — `MultipleChoiceQuestion.optionPopulations` (index-aligned with `options`, rendered
  in `MultipleChoiceQuestionView.tsx` next to each option but ONLY once answered, so it can't
  spoil the guess) shows both real population figures once the two population-comparison
  questions are answered. The user then asked for "the same thing" on the is-largest-city
  question, which doesn't fit `optionPopulations` (its options are literally "Yes"/"No", not
  entity labels) — added a new `revealText` field instead (shown post-answer as its own line, no
  image required, distinct from `revealCaption` which the view only renders alongside
  `revealImageUrl`), naming the real largest city and its population whenever the asked-about
  city wasn't actually it.

**Officeholders new-question-types batch (2026-09-04, separate same-day follow-up session)** —
driven by the user's own hand-written list of question-type ideas, worked through one at a time,
each shipped as its own commit with live Playwright verification before moving to the next. Took
Officeholders from 2 question types to 6; the user explicitly paused before the remaining two
ideas (district number per representative, and a "name the two current senators of a state"
question) rather than building everything in the list — deprioritized, not abandoned.
- **`buildOfficeholderPhotoQuestions`** (renamed from `buildLegislatorPhotoQuestions`) — the user
  pointed out that a proposed new "which state does this officeholder belong to?" question would
  just be the existing legislator-photo question with governors added to the pool, not a genuinely
  new question type. Folded governors into the SAME pool instead of shipping a near-duplicate:
  `GovernorFact` gained a `party` field (`governors-data.ts`, needed for the caption badge), and
  the prompt is now role-aware ("Which state is this senator/representative/governor from?").
  Governors with no synced photo are silently excluded, same as a photo-less legislator already
  was.
- **`buildOfficeholderPartyQuestions`** — "What party is Senator/Representative/Governor X of
  Y?", reusing the same merged pool and the 2-4-option-by-real-distinct-values pattern
  `buildCandidatePartyQuestions` (Midterms) already established. Excludes any officeholder with no
  known party (a handful of governor rows) — same reasoning `candidateFactsFromRaces` already
  uses. No party badge on the photo caption, unlike the state-guess question above — that would
  give away the answer here.
- **`buildOfficeholderNameQuestions`** — combined photo+state clue guessing the specific person's
  name. The user explicitly preferred this over a plain "guess the legislator from their photo"
  idea once both were on the table, reasoning that a bare photo alone teaches little beyond raw
  face-recognition; including the state as a second clue is what makes the question actually
  educational. Distractors are drawn from the subject's OWN state first when it has ≥3 other
  officeholders in the pool (`SAME_STATE_DISTRACTOR_MINIMUM`) — this is what makes the state clue
  load-bearing rather than decorative, since a wrong guess then has to be someone who could
  plausibly hold this exact office in this exact state; falls back to the nationwide pool for a
  sparser state. **Prompt wording caught a real correctness bug from live user feedback before
  shipping**: the first version read "This is the senator/representative from {state}. Who is
  it?", which falsely implies uniqueness — a state has TWO senators and (almost always) several
  representatives, so "the" was simply wrong for those two roles. Fixed to "This is one of the
  U.S. Senators from {state}." / "This is one of {state}'s U.S. Representatives." — governor alone
  keeps "the," since a state has exactly one.
- **`buildChamberQuestions`** — "Which chamber of Congress does this legislator serve in?", U.S.
  Senate vs. U.S. House of Representatives. Legislators only, not governors (no chamber to guess).
  Only 2 possible values nationwide, so `optionCount: 2` like the party question above. The
  photo/name/party caption is safe to show up front — none of it hints at chamber the way it would
  spoil the party question's caption.
- **`buildHouseSeatCountQuestions`** — "How many U.S. House seats does {state} have?", text-only
  (a seat count has no photo). Needed a new `src/lib/districts-data.ts` (`getHouseSeatCountsByState()`),
  the first query against the Postgres `districts` metadata table (previously only its Storage
  topology blob was ever read) — counts rows per `state_id` rather than counting occupied `terms`
  rows, since a vacancy would silently undercount a state's real apportionment. Distractor options
  are plain nationwide-random seat-count values (no proximity-to-correct-answer weighting, same as
  every other numeric MC question in the app), deduped by rendered text like every other generator
  — small states clustering around 1-2 seats means duplicate values are common but never double-
  counted as separate options.

**Sports new-question-types batch (2026-09-04, separate same-day follow-up session)** — driven by
the user's own hand-written list of 12 question-type ideas, ranked by ease before starting (pro
pool alone first, college programs once the recognizability concern below was resolved), each
shipped as its own commit with live Playwright verification. Took Sports from 2 question types to
9; three items from the original list remain unbuilt (a pro/college/combined team-count state
comparison, plus two new matching-pairs variants — match team to conference/league, match school
nickname to school) — the user explicitly stopped here ("I think we are good with what we have"),
deprioritized not abandoned, same pause pattern as Officeholders above.
- **`buildLeagueQuestions`** — "Which league does the {team} play in?", distractors from the
  other real leagues in the pool (7 nationwide). Team already named in the prompt, so the logo can
  show immediately without spoiling the answer, same reasoning `buildTeamStateQuestions` already
  established.
- **`buildTeamCityQuestions`** — "Which city is the {team} based in?", a new question distinct
  from the existing team-state question (same immediate-logo reasoning as above).
- **`buildTeamByCityQuestions`/`buildTeamByStateQuestions`** — the reverse direction: "Which of
  these teams is based in {city/state}?", team name as the answer. **Needed a real correctness
  fix neither of the "forward" questions above needs**: several cities/states (New York, Los
  Angeles, Chicago; most states) host more than one synced team, so a naively-built distractor
  pool could include another team that's ALSO genuinely based in the asked-about place — both
  generators exclude every other team sharing the subject's exact city/state from the distractor
  pool before picking, confirmed live (a Manhattan question correctly offered only the Knicks
  among Manhattan-based options, never the Rangers). Since the team name is the answer here, the
  logo can't be shown up front without spoiling it — both reveal the correct team's logo + name
  below the options after answering instead (added in a follow-up within the same session, at the
  user's own request, mirroring the officeholders governor question's reveal timing).
- **The college-programs question types needed a real design decision before any code**, not just
  new generators: the user was upfront that the full pool (138 football + 365 basketball = 503
  programs) worried them as overwhelming and full of unrecognizable schools before agreeing to add
  college data to the Sports pool at all. Queried the actual synced `conference` values live
  before proposing anything (rather than guessing) — confirmed football's real "Power 4" (Big
  Ten/SEC/ACC/Big 12, 67/138 programs) and added Big East as a 5th power conference for basketball
  specifically (it's basketball-only — Villanova/UConn/Georgetown play no FBS football at all).
  Recommended restricting every new college question type's subject AND distractor pool to just
  these power-conference programs (146/503 total) rather than the full pool, reasoning that a
  mid-major/FCS-adjacent school is closer to unguessable trivia than a fair question, with no
  logo-recognition fallback the way pro teams have. User approved outright with no pushback.
  `restrictToPowerConferences`/`COLLEGE_FOOTBALL_POWER_CONFERENCES`/
  `COLLEGE_BASKETBALL_POWER_CONFERENCES` (`sports-questions.ts`) implement this, reused by all
  three college-aware generators below. Sports' pool shape changed from a bare `SportsTeam[]` to
  `{teams, collegeFootball, collegeBasketball}` (`SportsPool` in `engine.ts`) to carry the new
  fetches — Mashups' pool/speed-round follow the same shape change since they reuse the Sports
  fetch, touching `fetchCategoryPool`/`getCategoryPoolSize`/`buildCategorySession`/
  `buildMatchingBoard`/`buildSpeedRoundPool`; verified live afterward that matching mode and the
  speed round both still work with zero regressions.
  - **`buildSchoolFromNicknameQuestions`** — "Which school's team is called the {nickname}?". No
    image up front (a program's logo usually names or strongly hints at the school itself, which
    IS the answer) — reveals the correct school's logo + name below the options after answering
    instead, same reveal timing as the team-by-city/team-by-state questions above.
  - **`buildCollegeConferenceQuestions`** — "Which conference does {school} play in?", options
    from the same restricted power-conference set. School already named in the prompt, so the
    logo can show immediately.
  - **`buildTeamLogoQuestions` was extended** (not a new generator) to mix power-conference
    college programs in alongside pro teams, guessed by school name rather than nickname — needed
    a small `LogoSubject` union (`{key, logoUrl, label}`) so one option pool can hold both
    `SportsTeam` and `CollegeProgram` rows together. Verified live: UCLA/Texas A&M/Utah correctly
    appear mixed in among pro-team logo options.
- **`buildProTeamCountQuestions`** — "How many pro sports teams does {state} have?", bucketed
  0/1/2/3+. Built last, at the user's own follow-up request (not from the original ease-ranked
  list). Draws from ALL 51 states via `getAllStates()`, not just states with a synced team, so a
  genuine 0-team state (e.g. North Dakota, Rhode Island) is a real, correctly-labeled answer
  rather than an unreachable case. Needed a new `MultipleChoiceQuestion.revealTeams` field
  (`types.ts`) distinct from the existing single-image `revealImageUrl`/`revealCaption` — this
  question can reveal any number of teams (including zero) below the options after answering,
  each with logo + league, per the user's own explicit spec (asked for "the logo, the league...
  anything else? you tell me" — answered with just those two fields, no city, and the user didn't
  push back). The empty-state copy is "No pro sports team in this state." — the user explicitly
  corrected an initial "No sports teams synced for this state" version as reading too much like a
  data-freshness note rather than a plain fact; amended into the same commit rather than left as a
  separate fixup.
