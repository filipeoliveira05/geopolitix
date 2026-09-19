/**
 * A standard round's raw score is a sum of per-question points (each 0-10), so its true max is
 * `questionCount * 10` — not a fixed 100. Normalizing against that max keeps the displayed score
 * comparable across the session-length picker's options (10/15/20/25 questions) instead of
 * scaling up with question count. Used both mid-round (QuizProgressHeader, against the fixed
 * total question count so it doesn't jump when the final normalization lands) and at the results
 * screen.
 */
export function normalizeQuizScore(rawScore: number, questionCount: number): number {
  if (questionCount <= 0) return 0;
  return Math.round((rawScore / (questionCount * 10)) * 100);
}
