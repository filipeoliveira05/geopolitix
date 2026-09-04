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

export function buildLeagueQuestions(
  teams: SportsTeam[],
  count: number,
): MultipleChoiceQuestion[] {
  const subjects = pickRandom(teams, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, teams, {
      getPrompt: (t) => `Which league does the ${t.name} play in?`,
      getOptionText: (t) => t.league,
      // Team is already named in the prompt, so the logo doesn't spoil the league answer — same
      // reasoning as buildTeamStateQuestions. No caption for the same reason: repeating the name
      // under the logo would be redundant.
      getImageUrl: (t) => t.logoUrl,
    }),
  );
}

export function buildTeamCityQuestions(
  teams: SportsTeam[],
  count: number,
): MultipleChoiceQuestion[] {
  const subjects = pickRandom(teams, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, teams, {
      getPrompt: (t) => `Which city is the ${t.name} based in?`,
      getOptionText: (t) => t.cityName,
      // Same reasoning as buildTeamStateQuestions: team is already named in the prompt, so
      // showing the logo up front doesn't spoil the city answer, and no caption is needed since
      // the name would just repeat the prompt text.
      getImageUrl: (t) => t.logoUrl,
    }),
  );
}

export function buildTeamByCityQuestions(
  teams: SportsTeam[],
  count: number,
): MultipleChoiceQuestion[] {
  const subjects = pickRandom(teams, count);
  return subjects.map((subject) => {
    // Excludes every OTHER team based in the same city from the distractor pool — several cities
    // (New York, Los Angeles, Chicago) host multiple synced teams, and a distractor option that's
    // also genuinely based in the asked-about city would make the question have more than one
    // correct answer. No image: the team name is the answer here (reverse of
    // buildTeamCityQuestions), so showing the subject's logo up front would give it away.
    const otherCitiesPool = teams.filter((t) => t.cityName !== subject.cityName);
    return buildMultipleChoiceQuestion(subject, [subject, ...otherCitiesPool], {
      getPrompt: (t) => `Which of these teams is based in ${t.cityName}?`,
      getOptionText: (t) => t.name,
    });
  });
}

export function buildMatchingPairs(teams: SportsTeam[], count: number): MatchingPair[] {
  const withLogo = teams.filter((t) => t.logoUrl !== null);
  const subjects = pickRandom(withLogo, count);
  return subjects.map((t) => ({ id: t.id, imageUrl: t.logoUrl as string, name: t.name }));
}
