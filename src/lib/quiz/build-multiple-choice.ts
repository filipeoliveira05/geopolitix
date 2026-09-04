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
    getImageCaption?: (subject: T) => string | null;
    getImageCaptionParty?: (subject: T) => string | null;
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
  for (const item of pool) {
    const text = opts.getOptionText(item);
    if (text === correctText || seen.has(text)) continue;
    seen.add(text);
    distractorCandidates.push(text);
  }

  const distractors = pickRandom(distractorCandidates, optionCount - 1);
  const options = pickRandom([correctText, ...distractors], optionCount);

  return {
    format: "multiple-choice",
    prompt: opts.getPrompt(subject),
    imageUrl: opts.getImageUrl ? opts.getImageUrl(subject) : null,
    imageCaption: opts.getImageCaption ? opts.getImageCaption(subject) : null,
    imageCaptionParty: opts.getImageCaptionParty ? opts.getImageCaptionParty(subject) : null,
    options,
    correctIndex: options.indexOf(correctText),
  };
}
