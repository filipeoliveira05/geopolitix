/**
 * Points earned for a search-select question, always out of 10 regardless of how many correct
 * entities the specific instance has (senators: 1-2, candidates: a handful, cities/teams: up to
 * ~10) — see docs/superpowers/specs/2026-09-05-quiz-search-select-format-design.md. Finding
 * everything always rounds up to exactly 10; finding everything-but-one never rounds up to a
 * false 10. The Math.min(9, ...) guard only matters for a hypothetically large targetCount (e.g.
 * 19/20 would round to 10 on its own) — not reachable with this app's actual target counts, kept
 * as a correctness guarantee rather than an assumption about pool sizes staying small.
 */
export function searchSelectPoints(foundCount: number, targetCount: number): number {
  if (targetCount <= 0) return 0;
  if (foundCount >= targetCount) return 10;
  return Math.min(9, Math.round(10 * (foundCount / targetCount)));
}
