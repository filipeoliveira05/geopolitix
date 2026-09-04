import type { SportsTeam, CollegeProgram } from "@/lib/geography-data";
import { getStateName } from "@/lib/states";
import { pickRandom } from "./random";
import { buildMultipleChoiceQuestion } from "./build-multiple-choice";
import type { MultipleChoiceQuestion, MatchingPair } from "./types";

// The full college pool (138 football + 365 basketball programs) is dominated by mid-major/
// FCS-adjacent schools nobody outside their own state would recognize — asking a nickname or
// conference question against the full pool is closer to unguessable trivia than a fair
// question, especially with no pro-team-style logo recognition to fall back on. Restricted to
// the nationally recognizable "power conference" programs instead: football's real Power 4
// (Big Ten/SEC/ACC/Big 12, 67/138 programs) plus, for basketball specifically, Big East — a
// basketball-only power conference (Villanova/UConn/Georgetown play no FBS football at all).
export const COLLEGE_FOOTBALL_POWER_CONFERENCES = new Set(["Big Ten", "SEC", "ACC", "Big 12"]);
export const COLLEGE_BASKETBALL_POWER_CONFERENCES = new Set([
  ...COLLEGE_FOOTBALL_POWER_CONFERENCES,
  "Big East",
]);

export function restrictToPowerConferences(
  programs: CollegeProgram[],
  powerConferences: Set<string>,
): CollegeProgram[] {
  return programs.filter((p) => p.conference !== null && powerConferences.has(p.conference));
}

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
      // Shown only after answering — the correct team's logo/name, same reveal timing the
      // governor question uses, so the round still teaches a logo-to-name association even
      // though the logo can't be shown up front here.
      getRevealImageUrl: (t) => t.logoUrl,
      getRevealCaption: (t) => t.name,
    });
  });
}

export function buildTeamByStateQuestions(
  teams: SportsTeam[],
  count: number,
): MultipleChoiceQuestion[] {
  const facts = withStateNames(teams);
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) => {
    // Same dedup reasoning as buildTeamByCityQuestions, one level up: most states host several
    // synced teams, so any other team from the same state has to be excluded from the distractor
    // pool or it'd also be a genuinely correct answer.
    const otherStatesPool = facts.filter((t) => t.stateId !== subject.stateId);
    return buildMultipleChoiceQuestion(subject, [subject, ...otherStatesPool], {
      getPrompt: (t) => `Which of these teams is based in ${t.stateName}?`,
      getOptionText: (t) => t.name,
      // Same reveal-timing reasoning as buildTeamByCityQuestions.
      getRevealImageUrl: (t) => t.logoUrl,
      getRevealCaption: (t) => t.name,
    });
  });
}

export function buildSchoolFromNicknameQuestions(
  collegeFootball: CollegeProgram[],
  collegeBasketball: CollegeProgram[],
  count: number,
): MultipleChoiceQuestion[] {
  const pool = [
    ...restrictToPowerConferences(collegeFootball, COLLEGE_FOOTBALL_POWER_CONFERENCES),
    ...restrictToPowerConferences(collegeBasketball, COLLEGE_BASKETBALL_POWER_CONFERENCES),
  ].filter((p) => p.nickname !== null);
  const subjects = pickRandom(pool, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, pool, {
      getPrompt: (p) => `Which school's team is called the ${p.nickname}?`,
      getOptionText: (p) => p.school,
      // No image up front — a program's logo usually names or strongly hints at the school
      // itself, which would give away the answer to a question that's asking for the school.
      // Reveals it below the options after answering instead, same reveal timing as the sports
      // by-city/by-state questions above.
      getRevealImageUrl: (p) => p.logoUrl,
      getRevealCaption: (p) => p.school,
    }),
  );
}

export function buildCollegeConferenceQuestions(
  collegeFootball: CollegeProgram[],
  collegeBasketball: CollegeProgram[],
  count: number,
): MultipleChoiceQuestion[] {
  const pool = [
    ...restrictToPowerConferences(collegeFootball, COLLEGE_FOOTBALL_POWER_CONFERENCES),
    ...restrictToPowerConferences(collegeBasketball, COLLEGE_BASKETBALL_POWER_CONFERENCES),
  ];
  const subjects = pickRandom(pool, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, pool, {
      getPrompt: (p) => `Which conference does ${p.school} play in?`,
      getOptionText: (p) => p.conference as string,
      // School is already named in the prompt, so showing the logo doesn't spoil the conference
      // answer — same reasoning as buildLeagueQuestions.
      getImageUrl: (p) => p.logoUrl,
    }),
  );
}

export function buildMatchingPairs(teams: SportsTeam[], count: number): MatchingPair[] {
  const withLogo = teams.filter((t) => t.logoUrl !== null);
  const subjects = pickRandom(withLogo, count);
  return subjects.map((t) => ({ id: t.id, imageUrl: t.logoUrl as string, name: t.name }));
}
