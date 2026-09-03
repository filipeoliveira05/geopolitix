import type { SportsTeam } from "@/lib/geography-data";
import { pickRandom } from "./random";
import type { MultipleChoiceQuestion } from "./types";

function groupByState(teams: SportsTeam[]): Map<string, SportsTeam[]> {
  const byState = new Map<string, SportsTeam[]>();
  for (const t of teams) {
    const list = byState.get(t.stateId) ?? [];
    list.push(t);
    byState.set(t.stateId, list);
  }
  return byState;
}

/** States with at least 3 teams — the minimum needed to pick "3 from the same state" for one
 * odd-one-out question. */
export function countOddOneOutEligibleStates(teams: SportsTeam[]): number {
  return [...groupByState(teams).values()].filter((list) => list.length >= 3).length;
}

/**
 * "Which of these teams is NOT based in the same state as the others?" — picks a state with ≥3
 * teams, takes 3 of them as the "same state" group, then picks one team from a DIFFERENT state as
 * the odd one out. Builds up to `count` questions, capped by how many eligible states actually
 * exist (unlike every other quiz generator, this one degrades gracefully rather than throwing —
 * "not enough eligible states" is a real, expected possibility, not a caller bug).
 */
export function buildOddOneOutQuestions(
  teams: SportsTeam[],
  count: number,
): MultipleChoiceQuestion[] {
  const eligibleEntries = [...groupByState(teams).entries()].filter(
    ([, list]) => list.length >= 3,
  );
  const chosenEntries = pickRandom(eligibleEntries, Math.min(count, eligibleEntries.length));

  return chosenEntries.map(([stateId, stateTeams]) => {
    const threeFromState = pickRandom(stateTeams, 3);
    const otherStateTeams = teams.filter((t) => t.stateId !== stateId);
    const [oddOne] = pickRandom(otherStateTeams, 1);
    const options = pickRandom([...threeFromState.map((t) => t.name), oddOne.name], 4);
    return {
      format: "multiple-choice",
      prompt: "Which of these teams is NOT based in the same state as the others?",
      imageUrl: null,
      options,
      correctIndex: options.indexOf(oddOne.name),
    };
  });
}
