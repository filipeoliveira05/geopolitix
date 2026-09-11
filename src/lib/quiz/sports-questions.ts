// See docs/quiz-notes.md before adding a new question type or touching this file — full architecture and every category's question-type batch writeup lives there, not repeated here.

import type { SportsTeam, CollegeProgram, StateFact } from "@/lib/geography-data";
import { getAllStates, getStateName } from "@/lib/states";
import { pickRandom } from "./random";
import { buildMultipleChoiceQuestion } from "./build-multiple-choice";
import type { MultipleChoiceQuestion, MatchingPair, SearchSelectQuestion } from "./types";

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

type LogoSubject = { key: string; logoUrl: string; label: string; league: string };

function teamsToLogoSubjects(teams: SportsTeam[]): LogoSubject[] {
  return teams
    .filter((t) => t.logoUrl !== null)
    .map((t) => ({ key: t.id, logoUrl: t.logoUrl as string, label: t.name, league: t.league }));
}

// `conference` is guaranteed non-null here — every caller passes an already
// restrictToPowerConferences()-filtered pool, which drops null-conference programs.
function programsToLogoSubjects(programs: CollegeProgram[]): LogoSubject[] {
  return programs
    .filter((p) => p.logoUrl !== null)
    .map((p) => ({
      key: p.id,
      logoUrl: p.logoUrl as string,
      label: p.school,
      league: p.conference as string,
    }));
}

export function buildTeamLogoQuestions(
  teams: SportsTeam[],
  collegeFootball: CollegeProgram[],
  collegeBasketball: CollegeProgram[],
  count: number,
): MultipleChoiceQuestion[] {
  // Same power-conference restriction as the nickname/conference questions — a college logo
  // without pro-team-style national recognition is even harder to guess than a nickname/
  // conference question, since there's no name in the prompt at all to narrow it down.
  const pool: LogoSubject[] = [
    ...teamsToLogoSubjects(teams),
    ...programsToLogoSubjects(
      restrictToPowerConferences(collegeFootball, COLLEGE_FOOTBALL_POWER_CONFERENCES),
    ),
    ...programsToLogoSubjects(
      restrictToPowerConferences(collegeBasketball, COLLEGE_BASKETBALL_POWER_CONFERENCES),
    ),
  ];
  const subjects = pickRandom(pool, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, pool, {
      questionType: "sports.team_logo",
      getSubjectId: (s) => s.key,
      getPrompt: () => "Which team is this?",
      // League for pro teams, conference for college programs — not a spoiler since the
      // team/school name is the thing being guessed, same baked-in-option convention as
      // buildTeamStateQuestions' "(XX)" abbreviation.
      getOptionText: (s) => `${s.label} (${s.league})`,
      getImageUrl: (s) => s.logoUrl,
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
      questionType: "sports.team_state",
      getSubjectId: (t) => t.id,
      getPrompt: (t) => `Which state is the ${t.name} based in?`,
      // "(XX)" baked directly into the option text, shown from the start — same not-a-spoiler
      // reasoning as Geography's flag/silhouette/city-state questions: the option here already IS
      // the state name being guessed, so its own abbreviation gives nothing extra away.
      getOptionText: (t) => `${t.stateName} (${t.stateId})`,
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
      questionType: "sports.league",
      getSubjectId: (t) => t.id,
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
      questionType: "sports.team_city",
      getSubjectId: (t) => t.id,
      getPrompt: (t) => `Which city is the ${t.name} based in?`,
      // "CityName, XX" — same disambiguation convention buildCityPopulationQuestions' own labels
      // already use, since several city names repeat across different states in the synced pool
      // (multiple "Portland"s). Shown from the start: the team name is already in the prompt, so
      // this doesn't spoil which option is correct.
      getOptionText: (t) => `${t.cityName}, ${t.stateId}`,
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
      questionType: "sports.team_by_city",
      getSubjectId: (t) => t.id,
      getPrompt: (t) => `Which of these teams is based in ${t.cityName}?`,
      // "(League)" baked into each option, shown from the start — which league a team plays in
      // doesn't hint at which one is actually based in the asked-about city, so no spoiler risk.
      getOptionText: (t) => `${t.name} (${t.league})`,
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
      questionType: "sports.team_by_state",
      getSubjectId: (t) => t.id,
      getPrompt: (t) => `Which of these teams is based in ${t.stateName}?`,
      // Same not-a-spoiler reasoning as buildTeamByCityQuestions above.
      getOptionText: (t) => `${t.name} (${t.league})`,
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
      questionType: "sports.school_nickname",
      getSubjectId: (p) => p.id,
      getPrompt: (p) => `Which school's team is called the ${p.nickname}?`,
      // "(Conference)" baked into each option, shown from the start — pool is already restricted
      // to power-conference programs (conference guaranteed non-null), and which conference a
      // school plays in doesn't hint at its nickname, so no spoiler risk.
      getOptionText: (p) => `${p.school} (${p.conference})`,
      // No image up front — a program's logo usually names or strongly hints at the school
      // itself, which would give away the answer to a question that's asking for the school.
      // Reveals it below the options after answering instead, same reveal timing as the sports
      // by-city/by-state questions above.
      getRevealImageUrl: (p) => p.logoUrl,
      getRevealCaption: (p) => p.school,
    }),
  );
}

export function buildCollegeCityQuestions(
  collegeFootball: CollegeProgram[],
  collegeBasketball: CollegeProgram[],
  count: number,
): MultipleChoiceQuestion[] {
  // Nickname-qualified, same eligibility filter buildSchoolFromNicknameQuestions already applies
  // — "the Iowa Hawkeyes" reads as a real team, not just a school name.
  const pool = [
    ...restrictToPowerConferences(collegeFootball, COLLEGE_FOOTBALL_POWER_CONFERENCES),
    ...restrictToPowerConferences(collegeBasketball, COLLEGE_BASKETBALL_POWER_CONFERENCES),
  ].filter((p) => p.nickname !== null);
  const subjects = pickRandom(pool, count);
  return subjects.map((subject) =>
    buildMultipleChoiceQuestion(subject, pool, {
      questionType: "sports.college_city",
      getSubjectId: (p) => p.id,
      getPrompt: (p) => `Which city are the ${p.school} ${p.nickname} based in?`,
      // "CityName, XX" — same disambiguation convention buildTeamCityQuestions' own options
      // already use, since several city names repeat across the synced pool. Shown from the
      // start: the school is already named in the prompt, so this doesn't spoil which option is
      // correct.
      getOptionText: (p) => `${p.cityName}, ${p.stateId}`,
      // Same reasoning as buildCollegeConferenceQuestions: school is already named in the prompt,
      // so showing the logo doesn't spoil the city answer, and no caption is needed since the
      // name would just repeat the prompt text.
      getImageUrl: (p) => p.logoUrl,
    }),
  );
}

export function buildCollegeByCityQuestions(
  collegeFootball: CollegeProgram[],
  collegeBasketball: CollegeProgram[],
  count: number,
): MultipleChoiceQuestion[] {
  const pool = [
    ...restrictToPowerConferences(collegeFootball, COLLEGE_FOOTBALL_POWER_CONFERENCES),
    ...restrictToPowerConferences(collegeBasketball, COLLEGE_BASKETBALL_POWER_CONFERENCES),
  ];
  const subjects = pickRandom(pool, count);
  return subjects.map((subject) => {
    // Excludes every OTHER program based in the same city from the distractor pool — same
    // dedup reasoning as buildTeamByCityQuestions: a handful of cities (e.g. University Park,
    // TX/PA — SMU and Penn State both call a "University Park" home) host more than one synced
    // power-conference program, and an unexcluded same-city distractor would also be genuinely
    // correct.
    const otherCitiesPool = pool.filter((p) => p.cityName !== subject.cityName);
    return buildMultipleChoiceQuestion(subject, [subject, ...otherCitiesPool], {
      questionType: "sports.college_by_city",
      getSubjectId: (p) => p.id,
      getPrompt: (p) => `Which of these college programs is based in ${p.cityName}?`,
      // "(Conference)" baked into each option, shown from the start — same not-a-spoiler
      // reasoning as buildTeamByCityQuestions' "(League)": which conference a program plays in
      // doesn't hint at which one is actually based in the asked-about city.
      getOptionText: (p) => `${p.school} (${p.conference})`,
      // Shown only after answering, same reveal timing as buildTeamByCityQuestions — the correct
      // program's logo can't be shown up front here without giving away the school itself.
      getRevealImageUrl: (p) => p.logoUrl,
      getRevealCaption: (p) => p.school,
    });
  });
}

export function buildCollegeByStateQuestions(
  collegeFootball: CollegeProgram[],
  collegeBasketball: CollegeProgram[],
  count: number,
): MultipleChoiceQuestion[] {
  const pool = [
    ...restrictToPowerConferences(collegeFootball, COLLEGE_FOOTBALL_POWER_CONFERENCES),
    ...restrictToPowerConferences(collegeBasketball, COLLEGE_BASKETBALL_POWER_CONFERENCES),
  ];
  const facts = pool
    .map((p) => {
      const stateName = getStateName(p.stateId);
      return stateName ? { ...p, stateName } : null;
    })
    .filter((p): p is CollegeProgram & { stateName: string } => p !== null);
  const subjects = pickRandom(facts, count);
  return subjects.map((subject) => {
    // Same dedup reasoning as buildCollegeByCityQuestions, one level up: most power-conference
    // states host several synced programs (football AND basketball), so any other program from
    // the same state has to be excluded from the distractor pool or it'd also be a genuinely
    // correct answer.
    const otherStatesPool = facts.filter((p) => p.stateId !== subject.stateId);
    return buildMultipleChoiceQuestion(subject, [subject, ...otherStatesPool], {
      questionType: "sports.college_by_state",
      getSubjectId: (p) => p.id,
      getPrompt: (p) => `Which of these college programs is based in ${p.stateName}?`,
      // Same not-a-spoiler reasoning as buildCollegeByCityQuestions above.
      getOptionText: (p) => `${p.school} (${p.conference})`,
      // Same reveal-timing reasoning as buildCollegeByCityQuestions.
      getRevealImageUrl: (p) => p.logoUrl,
      getRevealCaption: (p) => p.school,
    });
  });
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
      questionType: "sports.college_conference",
      getSubjectId: (p) => p.id,
      getPrompt: (p) => `Which conference does ${p.school} play in?`,
      getOptionText: (p) => p.conference as string,
      // School is already named in the prompt, so showing the logo doesn't spoil the conference
      // answer — same reasoning as buildLeagueQuestions.
      getImageUrl: (p) => p.logoUrl,
    }),
  );
}

const TEAM_COUNT_BUCKETS = ["0", "1", "2", "3+"];

function bucketForTeamCount(n: number): string {
  if (n >= 3) return "3+";
  return String(n);
}

export function buildProTeamCountQuestions(
  teams: SportsTeam[],
  count: number,
): MultipleChoiceQuestion[] {
  const teamsByState = new Map<string, SportsTeam[]>();
  for (const t of teams) {
    const list = teamsByState.get(t.stateId);
    if (list) list.push(t);
    else teamsByState.set(t.stateId, [t]);
  }

  const subjects = pickRandom(getAllStates(), count);
  return subjects.map((state) => {
    const stateTeams = teamsByState.get(state.abbr) ?? [];
    const correctBucket = bucketForTeamCount(stateTeams.length);
    return {
      format: "multiple-choice",
      questionType: "sports.pro_team_count",
      subjects: [{ id: state.abbr, label: state.name }],
      prompt: `How many pro sports teams does ${state.name} have?`,
      imageUrl: null,
      imageCaption: null,
      imageCaptionParty: undefined,
      revealImageUrl: null,
      revealCaption: null,
      optionsAreParties: false,
      options: TEAM_COUNT_BUCKETS,
      correctIndex: TEAM_COUNT_BUCKETS.indexOf(correctBucket),
      // Shown after answering regardless of the bucket size — including an explicit empty list
      // for a genuine 0-team state, handled by the view.
      revealTeams: stateTeams.map((t) => ({
        name: t.name,
        league: t.league,
        logoUrl: t.logoUrl,
      })),
    };
  });
}

export function buildMatchingPairs(teams: SportsTeam[], count: number): MatchingPair[] {
  const withLogo = teams.filter((t) => t.logoUrl !== null);
  const subjects = pickRandom(withLogo, count);
  return subjects.map((t) => ({ id: t.id, imageUrl: t.logoUrl as string, name: t.name }));
}

/**
 * "Name every pro sports team based in {state}." — search-and-select format. States with zero
 * synced pro teams are excluded — same "a question with nothing to find isn't a real question"
 * reasoning as every other eligibility-filtered generator here (unlike buildProTeamCountQuestions
 * above, which deliberately DOES include 0-team states as a valid multiple-choice bucket). targets
 * sorted alphabetically by team name — no other natural ordering exists across a state's teams,
 * which can span several different leagues.
 */
export function buildStateTeamRecallQuestions(
  teams: SportsTeam[],
  states: StateFact[],
  count: number,
): SearchSelectQuestion[] {
  const flagByState = new Map(states.map((s) => [s.stateId, s.flagUrl]));
  const stateNameById = new Map(states.map((s) => [s.stateId, s.stateName]));
  const teamsByState = new Map<string, SportsTeam[]>();
  for (const t of teams) {
    const list = teamsByState.get(t.stateId);
    if (list) list.push(t);
    else teamsByState.set(t.stateId, [t]);
  }
  const eligible = Array.from(teamsByState.entries()).filter(
    ([stateId, stateTeams]) => stateTeams.length > 0 && flagByState.has(stateId),
  );
  const subjects = pickRandom(eligible, count);
  return subjects.map(([stateId, stateTeams]) => {
    const stateName = stateNameById.get(stateId) as string;
    const sorted = [...stateTeams].sort((a, b) => a.name.localeCompare(b.name));
    return {
      format: "search-select",
      questionType: "sports.state_team_recall",
      prompt: `Name every pro sports team based in ${stateName}.`,
      imageUrl: flagByState.get(stateId) as string,
      entityType: "team",
      targets: sorted.map((t) => ({ id: t.id, label: t.name, photoUrl: t.logoUrl, league: t.league })),
    };
  });
}
