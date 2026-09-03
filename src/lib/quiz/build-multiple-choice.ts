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
  },
): MultipleChoiceQuestion {
  const correctText = opts.getOptionText(subject);

  const seen = new Set<string>();
  const distractorCandidates: string[] = [];
  for (const item of pool) {
    const text = opts.getOptionText(item);
    if (text === correctText || seen.has(text)) continue;
    seen.add(text);
    distractorCandidates.push(text);
  }

  const distractors = pickRandom(distractorCandidates, 3);
  const options = pickRandom([correctText, ...distractors], 4);

  return {
    format: "multiple-choice",
    prompt: opts.getPrompt(subject),
    imageUrl: opts.getImageUrl ? opts.getImageUrl(subject) : null,
    options,
    correctIndex: options.indexOf(correctText),
  };
}
