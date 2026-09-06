import { pickRandom } from "./random";
import type { MultipleChoiceQuestion } from "./types";

/**
 * Builds one multiple-choice question: `subject` is the row the correct answer is drawn from,
 * `pool` is every candidate row (including `subject`) distractors can be drawn from. Distractors
 * are deduped by their rendered option TEXT (via getOptionText), not by row identity — two
 * different rows that happen to render the same text only count as one possible option.
 */
export function buildMultipleChoiceQuestion<T>(
  subject: T,
  pool: T[],
  opts: {
    getPrompt: (subject: T) => string;
    getOptionText: (item: T) => string;
    getImageUrl?: (subject: T) => string | null;
    // See MultipleChoiceQuestion.silhouettePath — mutually exclusive with getImageUrl, never both
    // on the same question type.
    getSilhouettePath?: (subject: T) => string | null;
    // See MultipleChoiceQuestion.imageBelowPrompt — renders the image after the prompt instead of
    // before it, for a question type whose prompt already names the subject in text.
    imageBelowPrompt?: boolean;
    getImageCaption?: (subject: T) => string | null;
    getImageCaptionParty?: (subject: T) => string | null;
    getRevealImageUrl?: (subject: T) => string | null;
    getRevealCaption?: (subject: T) => string | null;
    // Shown next to revealImageUrl/revealCaption, but no image or caption involved
    // (MultipleChoiceQuestion.revealText) — for a question type that wants to teach one extra fact
    // after answering, unrelated to the reveal photo/name (e.g. the chamber question also
    // revealing the legislator's state).
    getRevealText?: (subject: T) => string | null;
    // Shown next to each option after answering (MultipleChoiceQuestion.optionPopulations) — for
    // a question type whose options are real-world entities with a population worth revealing
    // (e.g. "what's the largest city in X?"), same reveal-timing convention the two population-
    // comparison generators already established, just plumbed through this shared builder instead
    // of bypassing it.
    getOptionPopulation?: (item: T) => number | null;
    // Shown next to each option (MultipleChoiceQuestion.optionParties) — for a question type
    // whose options are people/parties worth badging (e.g. "who is the governor of X?").
    getOptionParty?: (item: T) => string | null;
    // Shown next to each option (MultipleChoiceQuestion.optionImages) — for a question type whose
    // options are people worth showing a face for up front (e.g. "who is the governor of X?").
    getOptionImage?: (item: T) => string | null;
    // Shown next to each option after answering (MultipleChoiceQuestion.optionStateAbbrs) — for a
    // question type whose options are cities/entities worth naming the real owning state for
    // (e.g. "what is the capital of X?").
    getOptionStateAbbr?: (item: T) => string | null;
    getRevealCaptionParty?: (subject: T) => string | null;
    optionsAreParties?: boolean;
    // Defaults to 4 (every Geography/Officeholders question uses this many). A question type
    // whose real answer space has fewer than 4 distinct values (e.g. political party —
    // realistically only 2-3 values nationwide) passes a smaller count instead of forcing a
    // doomed 4-option question that can never find enough real distractors.
    optionCount?: number;
  },
): MultipleChoiceQuestion {
  const optionCount = opts.optionCount ?? 4;
  const correctText = opts.getOptionText(subject);

  const seen = new Set<string>();
  const distractorCandidates: string[] = [];
  // Tracks which pool item produced each option TEXT (first-seen wins, same as the dedup itself)
  // so getOptionPopulation can be looked back up after the final shuffle/selection below, which
  // otherwise only carries option strings, not the original items.
  const itemByText = new Map<string, T>([[correctText, subject]]);
  for (const item of pool) {
    const text = opts.getOptionText(item);
    if (text === correctText || seen.has(text)) continue;
    seen.add(text);
    distractorCandidates.push(text);
    itemByText.set(text, item);
  }

  const distractors = pickRandom(distractorCandidates, optionCount - 1);
  const options = pickRandom([correctText, ...distractors], optionCount);

  return {
    format: "multiple-choice",
    prompt: opts.getPrompt(subject),
    imageUrl: opts.getImageUrl ? opts.getImageUrl(subject) : null,
    silhouettePath: opts.getSilhouettePath ? (opts.getSilhouettePath(subject) ?? undefined) : undefined,
    imageBelowPrompt: opts.imageBelowPrompt,
    imageCaption: opts.getImageCaption ? opts.getImageCaption(subject) : null,
    imageCaptionParty: opts.getImageCaptionParty ? opts.getImageCaptionParty(subject) : undefined,
    revealImageUrl: opts.getRevealImageUrl ? opts.getRevealImageUrl(subject) : null,
    revealCaption: opts.getRevealCaption ? opts.getRevealCaption(subject) : null,
    revealCaptionParty: opts.getRevealCaptionParty ? opts.getRevealCaptionParty(subject) : undefined,
    revealText: opts.getRevealText ? opts.getRevealText(subject) : null,
    optionsAreParties: opts.optionsAreParties ?? false,
    optionPopulations: opts.getOptionPopulation
      ? options.map((text) => {
          const item = itemByText.get(text);
          return item ? (opts.getOptionPopulation as (item: T) => number | null)(item) : null;
        })
      : undefined,
    optionParties: opts.getOptionParty
      ? options.map((text) => {
          const item = itemByText.get(text);
          return item ? (opts.getOptionParty as (item: T) => string | null)(item) : null;
        })
      : undefined,
    optionImages: opts.getOptionImage
      ? options.map((text) => {
          const item = itemByText.get(text);
          return item ? (opts.getOptionImage as (item: T) => string | null)(item) : null;
        })
      : undefined,
    optionStateAbbrs: opts.getOptionStateAbbr
      ? options.map((text) => {
          const item = itemByText.get(text);
          return item ? (opts.getOptionStateAbbr as (item: T) => string | null)(item) : null;
        })
      : undefined,
    options,
    correctIndex: options.indexOf(correctText),
  };
}
