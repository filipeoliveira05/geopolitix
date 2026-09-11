import { describe, it, expect } from "vitest";
import {
  buildTeamLogoQuestions,
  buildTeamStateQuestions,
  buildTeamCityQuestions,
  buildTeamByCityQuestions,
  buildTeamByStateQuestions,
  buildSchoolFromNicknameQuestions,
  buildCollegeCityQuestions,
  buildCollegeByCityQuestions,
  buildCollegeByStateQuestions,
  buildCollegeConferenceQuestions,
  buildCollegeProgramCountQuestions,
  buildMatchingPairs,
  buildProTeamCountQuestions,
  buildStateTeamRecallQuestions,
} from "./sports-questions";
import type { SportsTeam, CollegeProgram, StateFact } from "@/lib/geography-data";

// Real state abbreviations, not synthetic ones — getStateName() is pure/local (no Supabase call)
// and genuinely resolves these; a fake abbreviation would make buildTeamStateQuestions filter the
// fixture team out entirely (it drops any team whose state can't be resolved).
const REAL_STATE_ABBRS = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA"];

function makeTeams(n: number): SportsTeam[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `T${i}`,
    name: `Team${i}`,
    league: "NFL",
    cityName: `City${i}`,
    stateId: REAL_STATE_ABBRS[i % REAL_STATE_ABBRS.length],
    wikipediaTitle: null,
    logoUrl: `https://example.com/logo${i}.png`,
    bioSummary: null,
    lastSyncedAt: null,
  }));
}

function makeCollegePrograms(n: number, conference: string): CollegeProgram[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `C${conference}${i}`,
    school: `School${conference}${i}`,
    nickname: `Nickname${i}`,
    cityName: `City${i}`,
    stateId: REAL_STATE_ABBRS[i % REAL_STATE_ABBRS.length],
    conference,
    wikipediaTitle: null,
    logoUrl: `https://example.com/college-logo${conference}${i}.png`,
    bioSummary: null,
    lastSyncedAt: null,
  }));
}

describe("buildTeamLogoQuestions", () => {
  it("builds the requested number of questions", () => {
    expect(buildTeamLogoQuestions(makeTeams(10), [], [], 5)).toHaveLength(5);
  });

  it("includes power-conference college programs (by school name + nickname) alongside pro teams", () => {
    const teams = makeTeams(3);
    const football = makeCollegePrograms(5, "Big Ten");
    const questions = buildTeamLogoQuestions(teams, football, [], 8);
    const schoolAnswers = questions.filter((q) =>
      q.options[q.correctIndex].startsWith("SchoolBig Ten"),
    );
    expect(schoolAnswers.length).toBeGreaterThan(0);
    for (const q of schoolAnswers) {
      expect(q.options[q.correctIndex]).toMatch(/^SchoolBig Ten\d+ Nickname\d+ \(Big Ten\)$/);
    }
  });

  it("excludes a college program with no nickname", () => {
    const teams = makeTeams(3);
    const football = makeCollegePrograms(5, "Big Ten");
    football[0] = { ...football[0], nickname: null };
    const questions = buildTeamLogoQuestions(teams, football, [], 7);
    for (const q of questions) {
      expect(q.options[q.correctIndex]).not.toMatch(/^SchoolBig Ten0 /);
    }
  });

  it("excludes non-power-conference college programs", () => {
    const teams = makeTeams(5);
    const nonPower = makeCollegePrograms(20, "Sun Belt");
    const questions = buildTeamLogoQuestions(teams, nonPower, [], 3);
    for (const q of questions) {
      expect(q.options[q.correctIndex].startsWith("SchoolSun Belt")).toBe(false);
    }
  });

  it("uses the subject team's logo as the image and team names as options", () => {
    const teams = makeTeams(10);
    const questions = buildTeamLogoQuestions(teams, [], [], 5);
    for (const q of questions) {
      expect(q.imageUrl).toMatch(/^https:\/\/example\.com\/logo\d+\.png$/);
      const correctOption = q.options[q.correctIndex];
      const matchingTeam = teams.find((t) => correctOption === `${t.name} (${t.league})`);
      expect(matchingTeam?.logoUrl).toBe(q.imageUrl);
    }
  });

  it("skips teams with no logo", () => {
    const teams = makeTeams(5);
    teams[0] = { ...teams[0], logoUrl: null };
    const questions = buildTeamLogoQuestions(teams, [], [], 4);
    for (const q of questions) {
      expect(q.options[q.correctIndex]).not.toBe("Team0");
    }
  });
});

describe("buildTeamStateQuestions", () => {
  it("builds the requested number of questions", () => {
    expect(buildTeamStateQuestions(makeTeams(10), 5)).toHaveLength(5);
  });

  it("phrases the prompt naming the team", () => {
    const [q] = buildTeamStateQuestions(makeTeams(10), 1);
    expect(q.prompt).toMatch(/^Which state is the Team\d+ based in\?$/);
  });

  it("shows the team's logo immediately (not gated behind answering), with no redundant caption", () => {
    const teams = makeTeams(10);
    const questions = buildTeamStateQuestions(teams, 5);
    for (const q of questions) {
      const subjectName = q.prompt.match(/^Which state is the (.+) based in\?$/)?.[1];
      const subject = teams.find((t) => t.name === subjectName);
      expect(q.imageUrl).toBe(subject?.logoUrl);
      expect(q.imageCaption).toBeNull();
    }
  });

  it("degrades gracefully to no image when the team has no logo", () => {
    const teams = makeTeams(10);
    teams[0] = { ...teams[0], logoUrl: null };
    const questions = buildTeamStateQuestions(teams, 10);
    const q = questions.find((q) => q.prompt.includes("Team0"));
    expect(q?.imageUrl).toBeNull();
  });

  it("has 4 options with a real correct answer", () => {
    const questions = buildTeamStateQuestions(makeTeams(10), 5);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(q.options[q.correctIndex]).toBeTruthy();
    }
  });

  it("shows every option's abbreviation from the start, not just the correct one (no spoiler risk here)", () => {
    const questions = buildTeamStateQuestions(makeTeams(10), 5);
    for (const q of questions) {
      for (const option of q.options) {
        expect(option).toMatch(/^.+ \(\w{2}\)$/);
      }
    }
  });
});

describe("buildTeamCityQuestions", () => {
  it("shows every option as \"CityName, XX\" from the start (disambiguates repeated city names)", () => {
    const teams = makeTeams(10);
    const questions = buildTeamCityQuestions(teams, 5);
    for (const q of questions) {
      for (const option of q.options) {
        expect(option).toMatch(/^City\d+, \w{2}$/);
      }
    }
  });

  it("has the subject's own city/state as the correct answer", () => {
    const teams = makeTeams(10);
    const questions = buildTeamCityQuestions(teams, 5);
    for (const q of questions) {
      const subjectName = q.prompt.match(/^Which city is the (.+) based in\?$/)?.[1];
      const subject = teams.find((t) => t.name === subjectName);
      expect(q.options[q.correctIndex]).toBe(`${subject?.cityName}, ${subject?.stateId}`);
    }
  });
});

describe("buildTeamByCityQuestions", () => {
  it("shows every option as \"TeamName (League)\" from the start (not a spoiler)", () => {
    const teams = makeTeams(10);
    const questions = buildTeamByCityQuestions(teams, 5);
    for (const q of questions) {
      for (const option of q.options) {
        expect(option).toMatch(/^Team\d+ \(NFL\)$/);
      }
    }
  });
});

describe("buildTeamByStateQuestions", () => {
  it("shows every option as \"TeamName (League)\" from the start (not a spoiler)", () => {
    const teams = makeTeams(10);
    const questions = buildTeamByStateQuestions(teams, 5);
    for (const q of questions) {
      for (const option of q.options) {
        expect(option).toMatch(/^Team\d+ \(NFL\)$/);
      }
    }
  });
});

describe("buildSchoolFromNicknameQuestions", () => {
  it("shows every option as \"School (Conference)\" from the start (not a spoiler)", () => {
    const programs = makeCollegePrograms(10, "SEC");
    const questions = buildSchoolFromNicknameQuestions(programs, [], 5);
    for (const q of questions) {
      for (const option of q.options) {
        expect(option).toMatch(/^SchoolSEC\d+ \(SEC\)$/);
      }
    }
  });
});

describe("buildCollegeConferenceQuestions", () => {
  // Option text is the bare conference name, so a single-conference fixture has zero distinct
  // distractors to draw from (every option would dedupe to the same text) — mix several real
  // power conferences, same as production's actual pool shape.
  function makeMixedConferencePrograms(): CollegeProgram[] {
    return [
      ...makeCollegePrograms(3, "SEC"),
      ...makeCollegePrograms(3, "Big Ten"),
      ...makeCollegePrograms(3, "ACC"),
      ...makeCollegePrograms(3, "Big 12"),
    ];
  }

  it("names the school AND its nickname in the prompt, not just the school", () => {
    const [q] = buildCollegeConferenceQuestions(makeMixedConferencePrograms(), [], 1);
    expect(q.prompt).toMatch(/^Which conference do the School.+ Nickname\d+ play in\?$/);
  });

  it("has the subject's own conference as the correct answer", () => {
    const programs = makeMixedConferencePrograms();
    const questions = buildCollegeConferenceQuestions(programs, [], 5);
    for (const q of questions) {
      const subjectName = q.prompt.match(/^Which conference do the (.+) Nickname\d+ play in\?$/)?.[1];
      const subject = programs.find((p) => p.school === subjectName);
      expect(q.options[q.correctIndex]).toBe(subject?.conference);
    }
  });

  it("excludes a program with no nickname", () => {
    const programs = makeMixedConferencePrograms();
    programs[0] = { ...programs[0], nickname: null };
    const questions = buildCollegeConferenceQuestions(programs, [], 11);
    for (const q of questions) {
      expect(q.prompt).not.toContain("SchoolSEC0 ");
    }
  });
});

describe("buildCollegeCityQuestions", () => {
  it("builds the requested number of questions", () => {
    const programs = makeCollegePrograms(10, "SEC");
    expect(buildCollegeCityQuestions(programs, [], 5)).toHaveLength(5);
  });

  it("shows every option as \"CityName, XX\" from the start (disambiguates repeated city names)", () => {
    const programs = makeCollegePrograms(10, "SEC");
    const questions = buildCollegeCityQuestions(programs, [], 5);
    for (const q of questions) {
      for (const option of q.options) {
        expect(option).toMatch(/^City\d+, \w{2}$/);
      }
    }
  });

  it("names the school AND its nickname in the prompt, not just the school", () => {
    const programs = makeCollegePrograms(10, "SEC");
    const [q] = buildCollegeCityQuestions(programs, [], 1);
    expect(q.prompt).toMatch(/^Which city are the SchoolSEC\d+ Nickname\d+ based in\?$/);
  });

  it("has the subject's own city/state as the correct answer", () => {
    const programs = makeCollegePrograms(10, "SEC");
    const questions = buildCollegeCityQuestions(programs, [], 5);
    for (const q of questions) {
      const subjectName = q.prompt.match(/^Which city are the (.+) Nickname\d+ based in\?$/)?.[1];
      const subject = programs.find((p) => p.school === subjectName);
      expect(q.options[q.correctIndex]).toBe(`${subject?.cityName}, ${subject?.stateId}`);
    }
  });

  it("includes both football and basketball power-conference programs", () => {
    const football = makeCollegePrograms(5, "Big Ten");
    const basketball = makeCollegePrograms(5, "Big East");
    const questions = buildCollegeCityQuestions(football, basketball, 8);
    const schools = questions.map(
      (q) => q.prompt.match(/^Which city are the (.+) Nickname\d+ based in\?$/)?.[1],
    );
    expect(schools.some((s) => s?.startsWith("SchoolBig Ten"))).toBe(true);
    expect(schools.some((s) => s?.startsWith("SchoolBig East"))).toBe(true);
  });

  it("excludes a program with no nickname", () => {
    const programs = makeCollegePrograms(10, "SEC");
    programs[0] = { ...programs[0], nickname: null };
    const questions = buildCollegeCityQuestions(programs, [], 9);
    for (const q of questions) {
      expect(q.prompt).not.toContain("SchoolSEC0 ");
    }
  });

  it("excludes non-power-conference programs", () => {
    const power = makeCollegePrograms(5, "Big Ten");
    const nonPower = makeCollegePrograms(20, "Sun Belt");
    const questions = buildCollegeCityQuestions([...power, ...nonPower], [], 5);
    for (const q of questions) {
      expect(q.prompt).not.toContain("SchoolSun Belt");
    }
  });
});

describe("buildCollegeByCityQuestions", () => {
  it("shows every option as \"School Nickname (Conference)\" from the start (not a spoiler)", () => {
    const programs = makeCollegePrograms(10, "SEC");
    const questions = buildCollegeByCityQuestions(programs, [], 5);
    for (const q of questions) {
      for (const option of q.options) {
        expect(option).toMatch(/^SchoolSEC\d+ Nickname\d+ \(SEC\)$/);
      }
    }
  });

  it("has the subject's own school+nickname as the correct answer, revealed with its logo", () => {
    const programs = makeCollegePrograms(10, "SEC");
    const questions = buildCollegeByCityQuestions(programs, [], 5);
    for (const q of questions) {
      const cityName = q.prompt.match(/^Which of these college programs is based in (.+)\?$/)?.[1];
      const subject = programs.find((p) => p.cityName === cityName);
      expect(q.options[q.correctIndex]).toBe(
        `${subject?.school} ${subject?.nickname} (${subject?.conference})`,
      );
      expect(q.revealCaption).toBe(`${subject?.school} ${subject?.nickname}`);
      expect(q.revealImageUrl).toBe(subject?.logoUrl);
    }
  });

  it("excludes a program with no nickname", () => {
    const programs = makeCollegePrograms(10, "SEC");
    programs[0] = { ...programs[0], nickname: null };
    const questions = buildCollegeByCityQuestions(programs, [], 9);
    for (const q of questions) {
      expect(q.prompt).not.toContain("City0");
      expect(q.options.some((o) => o.startsWith("SchoolSEC0 "))).toBe(false);
    }
  });

  it("excludes every other program sharing the same city from the distractor pool", () => {
    // Two power-conference programs deliberately placed in the same city ("Sharedville") —
    // whichever one is asked about, the other must never appear as a distractor, since it would
    // also be a genuinely correct answer. Plus enough distinct-city programs for the question to
    // still find 4 real options after excluding both Sharedville rows.
    const shared = makeCollegePrograms(2, "Big Ten").map((p) => ({ ...p, cityName: "Sharedville" }));
    const distinctCityPrograms = makeCollegePrograms(4, "SEC");
    const pool = [...shared, ...distinctCityPrograms];
    const questions = buildCollegeByCityQuestions(pool, [], pool.length);
    const sharedviewQuestion = questions.find((q) => q.prompt.includes("Sharedville"));
    expect(sharedviewQuestion).toBeDefined();
    const otherSharedSchool = shared.find(
      (p) => `${p.school} ${p.nickname}` !== sharedviewQuestion?.revealCaption,
    )?.school;
    expect(sharedviewQuestion?.options.some((o) => o.startsWith(`${otherSharedSchool} `))).toBe(
      false,
    );
  });

  it("includes both football and basketball power-conference programs", () => {
    const football = makeCollegePrograms(5, "Big Ten");
    const basketball = makeCollegePrograms(5, "Big East");
    const questions = buildCollegeByCityQuestions(football, basketball, 8);
    const conferences = questions.map((q) => q.revealCaption && q.options[q.correctIndex]);
    expect(conferences.some((o) => o?.includes("(Big Ten)"))).toBe(true);
    expect(conferences.some((o) => o?.includes("(Big East)"))).toBe(true);
  });
});

describe("buildCollegeByStateQuestions", () => {
  it("shows every option as \"School Nickname (Conference)\" from the start (not a spoiler)", () => {
    const programs = makeCollegePrograms(10, "SEC");
    const questions = buildCollegeByStateQuestions(programs, [], 5);
    for (const q of questions) {
      for (const option of q.options) {
        expect(option).toMatch(/^SchoolSEC\d+ Nickname\d+ \(SEC\)$/);
      }
    }
  });

  it("has the subject's own school+nickname as the correct answer, revealed with its logo", () => {
    const programs = makeCollegePrograms(10, "SEC");
    const questions = buildCollegeByStateQuestions(programs, [], 5);
    for (const q of questions) {
      expect(q.revealCaption).toBe(q.options[q.correctIndex].split(" (")[0]);
      const subject = programs.find((p) => `${p.school} ${p.nickname}` === q.revealCaption);
      expect(q.revealImageUrl).toBe(subject?.logoUrl);
    }
  });

  it("excludes a program with no nickname", () => {
    const programs = makeCollegePrograms(10, "SEC");
    programs[0] = { ...programs[0], nickname: null };
    const questions = buildCollegeByStateQuestions(programs, [], 9);
    for (const q of questions) {
      expect(q.options.some((o) => o.startsWith("SchoolSEC0 "))).toBe(false);
    }
  });

  it("excludes every other program sharing the same state from the distractor pool", () => {
    // Two placed in the same real state (Alabama) — whichever is asked about, the other must
    // never appear as a distractor, since it would also be a genuinely correct answer. Plus
    // enough distinct-state programs for the question to still find 4 real options after
    // excluding both Alabama rows.
    const alabama = makeCollegePrograms(2, "SEC").map((p) => ({ ...p, stateId: "AL" }));
    const distinctStatePrograms = makeCollegePrograms(4, "Big Ten").map((p, i) => ({
      ...p,
      stateId: ["OH", "MI", "WI", "IN"][i],
    }));
    const pool = [...alabama, ...distinctStatePrograms];
    const questions = buildCollegeByStateQuestions(pool, [], pool.length);
    const alabamaQuestion = questions.find((q) => q.prompt.includes("Alabama"));
    expect(alabamaQuestion).toBeDefined();
    const otherAlabamaSchool = alabama.find(
      (p) => `${p.school} ${p.nickname}` !== alabamaQuestion?.revealCaption,
    )?.school;
    expect(alabamaQuestion?.options.some((o) => o.startsWith(`${otherAlabamaSchool} `))).toBe(
      false,
    );
  });
});

describe("buildProTeamCountQuestions", () => {
  function teamsForState(stateId: string, n: number): SportsTeam[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `${stateId}-T${i}`,
      name: `${stateId} Team${i}`,
      league: "NFL",
      cityName: "SomeCity",
      stateId,
      wikipediaTitle: null,
      logoUrl: `https://example.com/${stateId}-logo${i}.png`,
      bioSummary: null,
      lastSyncedAt: null,
    }));
  }

  it("builds the requested number of questions, covering every 51 states with no crash", () => {
    const teams = [...teamsForState("AL", 1), ...teamsForState("AK", 2), ...teamsForState("AZ", 4)];
    const questions = buildProTeamCountQuestions(teams, 51);
    expect(questions).toHaveLength(51);
    expect(questions.every((q) => q.options.join(",") === "0,1,2,3+")).toBe(true);
  });

  it("buckets 0/1/2 exactly and 3+ for anything higher, revealing the real teams", () => {
    const teams = [...teamsForState("AL", 1), ...teamsForState("AK", 2), ...teamsForState("AZ", 4)];
    const questions = buildProTeamCountQuestions(teams, 51);
    const byStateName = (name: string) => questions.find((q) => q.prompt.includes(name));

    const alabama = byStateName("Alabama")!;
    expect(alabama.options[alabama.correctIndex]).toBe("1");
    expect(alabama.revealTeams).toHaveLength(1);

    const alaska = byStateName("Alaska")!;
    expect(alaska.options[alaska.correctIndex]).toBe("2");
    expect(alaska.revealTeams).toHaveLength(2);

    const arizona = byStateName("Arizona")!;
    expect(arizona.options[arizona.correctIndex]).toBe("3+");
    expect(arizona.revealTeams).toHaveLength(4);

    const colorado = byStateName("Colorado")!;
    expect(colorado.options[colorado.correctIndex]).toBe("0");
    expect(colorado.revealTeams).toHaveLength(0);
  });
});

describe("buildCollegeProgramCountQuestions", () => {
  function programsForState(stateId: string, n: number, conference: string): CollegeProgram[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `${stateId}-${conference}-${i}`,
      school: `${stateId} School${i}`,
      nickname: `Nickname${i}`,
      cityName: "SomeCity",
      stateId,
      conference,
      wikipediaTitle: null,
      logoUrl: `https://example.com/${stateId}-logo${i}.png`,
      bioSummary: null,
      lastSyncedAt: null,
    }));
  }

  it("builds the requested number of questions, covering every 51 states with no crash", () => {
    const football = [...programsForState("AL", 1, "SEC"), ...programsForState("AZ", 4, "Big 12")];
    const questions = buildCollegeProgramCountQuestions(football, [], 51);
    expect(questions).toHaveLength(51);
    expect(questions.every((q) => q.options.join(",") === "0,1,2,3+")).toBe(true);
  });

  it("buckets 0/1/2 exactly and 3+ for anything higher, revealing the real programs", () => {
    const football = [
      ...programsForState("AL", 1, "SEC"),
      ...programsForState("AK", 2, "Big Ten"),
      ...programsForState("AZ", 4, "Big 12"),
    ];
    const questions = buildCollegeProgramCountQuestions(football, [], 51);
    const byStateName = (name: string) => questions.find((q) => q.prompt.includes(name));

    const alabama = byStateName("Alabama")!;
    expect(alabama.options[alabama.correctIndex]).toBe("1");
    expect(alabama.revealTeams).toHaveLength(1);

    const alaska = byStateName("Alaska")!;
    expect(alaska.options[alaska.correctIndex]).toBe("2");
    expect(alaska.revealTeams).toHaveLength(2);

    const arizona = byStateName("Arizona")!;
    expect(arizona.options[arizona.correctIndex]).toBe("3+");
    expect(arizona.revealTeams).toHaveLength(4);

    const colorado = byStateName("Colorado")!;
    expect(colorado.options[colorado.correctIndex]).toBe("0");
    expect(colorado.revealTeams).toHaveLength(0);
    expect(colorado.revealTeamsEmptyText).toBe("No Power-4 college program in this state.");
  });

  it("counts football AND basketball programs together", () => {
    const football = programsForState("AL", 1, "SEC");
    const basketball = programsForState("AL", 2, "Big East");
    const questions = buildCollegeProgramCountQuestions(football, basketball, 51);
    const alabama = questions.find((q) => q.prompt.includes("Alabama"))!;
    expect(alabama.options[alabama.correctIndex]).toBe("3+");
    expect(alabama.revealTeams).toHaveLength(3);
  });

  it("excludes non-power-conference programs from the count", () => {
    const nonPower = programsForState("AL", 5, "Sun Belt");
    const questions = buildCollegeProgramCountQuestions(nonPower, [], 51);
    const alabama = questions.find((q) => q.prompt.includes("Alabama"))!;
    expect(alabama.options[alabama.correctIndex]).toBe("0");
  });

  it("does NOT require a nickname to count a program (undercounting would give a wrong answer)", () => {
    const football = programsForState("AL", 2, "SEC").map((p, i) =>
      i === 0 ? { ...p, nickname: null } : p,
    );
    const questions = buildCollegeProgramCountQuestions(football, [], 51);
    const alabama = questions.find((q) => q.prompt.includes("Alabama"))!;
    expect(alabama.options[alabama.correctIndex]).toBe("2");
    expect(alabama.revealTeams).toHaveLength(2);
    // The nickname-less program still gets revealed, just degraded to the bare school name.
    expect(alabama.revealTeams?.some((t) => t.name === "AL School0")).toBe(true);
  });

  it("reveals each program's school+nickname, conference, and logo", () => {
    const football = programsForState("AL", 1, "SEC");
    const questions = buildCollegeProgramCountQuestions(football, [], 51);
    const alabama = questions.find((q) => q.prompt.includes("Alabama"))!;
    expect(alabama.revealTeams).toEqual([
      { name: "AL School0 Nickname0", league: "SEC", logoUrl: "https://example.com/AL-logo0.png" },
    ]);
  });
});

describe("buildMatchingPairs", () => {
  it("builds the requested number of pairs", () => {
    expect(buildMatchingPairs(makeTeams(10), 6)).toHaveLength(6);
  });

  it("pairs each team's real logo with its real name", () => {
    const teams = makeTeams(10);
    const pairs = buildMatchingPairs(teams, 6);
    for (const p of pairs) {
      const team = teams.find((t) => t.id === p.id);
      expect(team?.logoUrl).toBe(p.imageUrl);
      expect(team?.name).toBe(p.name);
    }
  });

  it("only draws from teams that have a logo", () => {
    const teams = makeTeams(5);
    teams[0] = { ...teams[0], logoUrl: null };
    const pairs = buildMatchingPairs(teams, 4);
    expect(pairs.every((p) => p.id !== "T0")).toBe(true);
  });
});

function makeStateFacts(abbrs: string[]): StateFact[] {
  return abbrs.map((stateId, i) => ({
    stateId,
    stateName: `${stateId}Name`,
    capitalName: `${stateId}Capital`,
    flagUrl: `https://example.com/flag-${stateId}.png`,
    population: 1000 + i,
  }));
}

describe("buildStateTeamRecallQuestions", () => {
  it("builds the requested number of questions", () => {
    // makeTeams(20) cycles through 10 real state abbrs, so this gives 2 teams per state
    const teams = makeTeams(20);
    const questions = buildStateTeamRecallQuestions(teams, makeStateFacts(REAL_STATE_ABBRS), 5);
    expect(questions).toHaveLength(5);
  });

  it("sorts a state's teams alphabetically by name", () => {
    const teams = [
      { ...makeTeams(1)[0], id: "T1", name: "Zebras", stateId: "AL" },
      { ...makeTeams(1)[0], id: "T2", name: "Aardvarks", stateId: "AL" },
    ];
    const [q] = buildStateTeamRecallQuestions(teams, makeStateFacts(["AL"]), 1);
    expect(q.targets.map((t) => t.label)).toEqual(["Aardvarks", "Zebras"]);
  });

  it("excludes a state with zero synced pro teams", () => {
    const teams = [{ ...makeTeams(1)[0], id: "T1", stateId: "AL" }];
    const [q] = buildStateTeamRecallQuestions(teams, makeStateFacts(["AL", "AK"]), 1);
    expect(q.prompt).toBe("Name every pro sports team based in ALName.");
  });

  it("uses the state's flag and sets format/entityType", () => {
    const teams = [{ ...makeTeams(1)[0], id: "T1", stateId: "AL" }];
    const [q] = buildStateTeamRecallQuestions(teams, makeStateFacts(["AL"]), 1);
    expect(q.imageUrl).toBe("https://example.com/flag-AL.png");
    expect(q.format).toBe("search-select");
    expect(q.entityType).toBe("team");
    expect(q.prompt).toBe("Name every pro sports team based in ALName.");
  });

  it("carries each target's synced logo as photoUrl", () => {
    const teams = [
      { ...makeTeams(1)[0], id: "T1", stateId: "AL", logoUrl: "https://example.com/logo.png" },
    ];
    const [q] = buildStateTeamRecallQuestions(teams, makeStateFacts(["AL"]), 1);
    expect(q.targets[0].photoUrl).toBe("https://example.com/logo.png");
  });

  it("carries each target's league", () => {
    const teams = [{ ...makeTeams(1)[0], id: "T1", stateId: "AL", league: "NFL" }];
    const [q] = buildStateTeamRecallQuestions(teams, makeStateFacts(["AL"]), 1);
    expect(q.targets[0].league).toBe("NFL");
  });
});
