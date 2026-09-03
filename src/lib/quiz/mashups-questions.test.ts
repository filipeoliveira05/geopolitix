import { describe, it, expect } from "vitest";
import { countOddOneOutEligibleStates, buildOddOneOutQuestions } from "./mashups-questions";
import type { SportsTeam } from "@/lib/geography-data";

function makeTeam(id: string, stateId: string, name: string): SportsTeam {
  return {
    id,
    name,
    league: "NFL",
    cityName: "City",
    stateId,
    wikipediaTitle: null,
    logoUrl: null,
    bioSummary: null,
    lastSyncedAt: null,
  };
}

// 2 states with 3 teams each (eligible), 1 state with only 1 team (not eligible).
function makeTeams(): SportsTeam[] {
  return [
    makeTeam("1", "CA", "Team CA1"),
    makeTeam("2", "CA", "Team CA2"),
    makeTeam("3", "CA", "Team CA3"),
    makeTeam("4", "TX", "Team TX1"),
    makeTeam("5", "TX", "Team TX2"),
    makeTeam("6", "TX", "Team TX3"),
    makeTeam("7", "NY", "Team NY1"),
  ];
}

describe("countOddOneOutEligibleStates", () => {
  it("counts only states with at least 3 teams", () => {
    expect(countOddOneOutEligibleStates(makeTeams())).toBe(2); // CA and TX, not NY
  });

  it("returns 0 when no state has enough teams", () => {
    const teams = [makeTeam("1", "CA", "A"), makeTeam("2", "CA", "B")];
    expect(countOddOneOutEligibleStates(teams)).toBe(0);
  });
});

describe("buildOddOneOutQuestions", () => {
  it("builds up to the requested count, capped by eligible states", () => {
    expect(buildOddOneOutQuestions(makeTeams(), 5)).toHaveLength(2); // only CA and TX eligible
  });

  it("does not throw when count exceeds eligible states", () => {
    expect(() => buildOddOneOutQuestions(makeTeams(), 10)).not.toThrow();
  });

  it("has 4 options, with the odd one from a different state than the other three", () => {
    const teams = makeTeams();
    const questions = buildOddOneOutQuestions(teams, 2);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(q.imageUrl).toBeNull();
      const oddName = q.options[q.correctIndex];
      const oddTeam = teams.find((t) => t.name === oddName);
      const otherNames = q.options.filter((_, i) => i !== q.correctIndex);
      const otherStates = otherNames.map((n) => teams.find((t) => t.name === n)?.stateId);
      expect(new Set(otherStates).size).toBe(1); // the other three share exactly one state
      expect(otherStates[0]).not.toBe(oddTeam?.stateId); // the odd one is genuinely different
    }
  });
});
