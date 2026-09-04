import type { SportsTeam } from "@/lib/geography-data";
import { getStateName } from "@/lib/states";
import { pickRandom } from "./random";
import { buildMultipleChoiceQuestion } from "./build-multiple-choice";
import type { MultipleChoiceQuestion, MatchingPair } from "./types";

export function buildTeamLogoQuestions(
  teams: SportsTeam[],
  count: number,
): MultipleChoiceQuestion[] {
  const withLogo = teams.filter((t) => t.logoUrl !== null);
  const subjects = pickRandom(withLogo, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, withLogo, {
      getPrompt: () => "Which team is this?",
      getOptionText: (t) => t.name,
      getImageUrl: (t) => t.logoUrl,
    }),
  );
}

type TeamWithStateName = SportsTeam & { stateName: string };

function withStateNames(teams: SportsTeam[]): TeamWithStateName[] {
  return teams
    .map((t): TeamWithStateName | null => {
      const stateName = getStateName(t.stateId);
      return stateName ? { ...t, stateName } : null;
    })
    .filter((t): t is TeamWithStateName => t !== null);
}

export function buildTeamStateQuestions(
  teams: SportsTeam[],
  count: number,
): MultipleChoiceQuestion[] {
  const facts = withStateNames(teams);
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, facts, {
      getPrompt: (t) => `Which state is the ${t.name} based in?`,
      getOptionText: (t) => t.stateName,
      // Shown immediately, not gated behind answering — the team name is already in the prompt,
      // so the logo doesn't spoil the state answer (same reasoning as the midterms questions). No
      // caption — the team name is already right there in the prompt text, so repeating it under
      // the logo would be redundant (unlike e.g. the Legislator question, whose prompt never names
      // the subject). Not every team has a logo (not filtered out like buildTeamLogoQuestions
      // does), so this degrades gracefully to no image for those.
      getImageUrl: (t) => t.logoUrl,
    }),
  );
}

export function buildMatchingPairs(teams: SportsTeam[], count: number): MatchingPair[] {
  const withLogo = teams.filter((t) => t.logoUrl !== null);
  const subjects = pickRandom(withLogo, count);
  return subjects.map((t) => ({ id: t.id, imageUrl: t.logoUrl as string, name: t.name }));
}
