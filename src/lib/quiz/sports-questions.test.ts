import { describe, it, expect } from "vitest";
import { buildTeamLogoQuestions, buildTeamStateQuestions, buildMatchingPairs } from "./sports-questions";
import type { SportsTeam } from "@/lib/geography-data";

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

describe("buildTeamLogoQuestions", () => {
  it("builds the requested number of questions", () => {
    expect(buildTeamLogoQuestions(makeTeams(10), 5)).toHaveLength(5);
  });

  it("uses the subject team's logo as the image and team names as options", () => {
    const teams = makeTeams(10);
    const questions = buildTeamLogoQuestions(teams, 5);
    for (const q of questions) {
      expect(q.imageUrl).toMatch(/^https:\/\/example\.com\/logo\d+\.png$/);
      const correctOption = q.options[q.correctIndex];
      const matchingTeam = teams.find((t) => t.name === correctOption);
      expect(matchingTeam?.logoUrl).toBe(q.imageUrl);
    }
  });

  it("skips teams with no logo", () => {
    const teams = makeTeams(5);
    teams[0] = { ...teams[0], logoUrl: null };
    const questions = buildTeamLogoQuestions(teams, 4);
    for (const q of questions) {
      expect(q.options[q.correctIndex]).not.toBe("Team0");
    }
  });
});

describe("buildTeamStateQuestions", () => {
  it("builds the requested number of questions", () => {
    expect(buildTeamStateQuestions(makeTeams(10), 5)).toHaveLength(5);
  });

  it("has no image and phrases the prompt naming the team", () => {
    const [q] = buildTeamStateQuestions(makeTeams(10), 1);
    expect(q.imageUrl).toBeNull();
    expect(q.prompt).toMatch(/^Which state is the Team\d+ based in\?$/);
  });

  it("has 4 options with a real correct answer", () => {
    const questions = buildTeamStateQuestions(makeTeams(10), 5);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(q.options[q.correctIndex]).toBeTruthy();
    }
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
