import { describe, it, expect } from "vitest";
import { buildCategorySession, SESSION_LENGTH } from "./engine";
import type { CandidateFact } from "./midterms-questions";
import type { Race } from "@/lib/races-data";
import type { StateFact } from "@/lib/geography-data";

const REAL_STATE_ABBRS = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA"];

function makeStates(): StateFact[] {
  return REAL_STATE_ABBRS.map((abbr, i) => ({
    stateId: abbr,
    stateName: `State${i}`,
    capitalName: `Capital${i}`,
    flagUrl: `https://example.com/flag${i}.png`,
    population: 1000 + i,
  }));
}

function makeCandidates(): CandidateFact[] {
  return REAL_STATE_ABBRS.map((abbr, i) => ({
    name: `Candidate${i}`,
    party: i % 2 === 0 ? "Democrat" : "Republican",
    isIncumbent: false,
    stateName: `State${i}`,
    office: "senate",
    districtNumber: null,
    photoUrl: null,
  }));
}

function makeRaces(): Race[] {
  return REAL_STATE_ABBRS.map((abbr, i) => ({
    id: `race${i}`,
    office: "senate",
    stateId: abbr,
    districtNumber: null,
    status: "open",
    winnerCandidateId: null,
    candidates: [
      {
        id: `c${i}`,
        name: `Candidate${i}`,
        party: "Democrat",
        isIncumbent: false,
        matchedLegislatorId: null,
        matchedGovernorId: null,
        candidateId: null,
        photoUrl: null,
      },
    ],
  }));
}

function makeMidtermsPool() {
  return { candidates: makeCandidates(), races: makeRaces(), states: makeStates() };
}

describe("buildCategorySession — format filtering (midterms)", () => {
  it("never includes a search-select question when only multiple-choice is enabled", () => {
    const pool = makeMidtermsPool();
    for (let i = 0; i < 20; i++) {
      const questions = buildCategorySession("midterms", pool, ["multiple-choice"]);
      expect(questions.every((q) => q.format === "multiple-choice")).toBe(true);
    }
  });

  it("never includes a multiple-choice question when only search-select is enabled", () => {
    const pool = makeMidtermsPool();
    for (let i = 0; i < 20; i++) {
      const questions = buildCategorySession("midterms", pool, ["search-select"]);
      expect(questions.every((q) => q.format === "search-select")).toBe(true);
    }
  });

  it("always returns exactly SESSION_LENGTH questions regardless of which formats are enabled", () => {
    const pool = makeMidtermsPool();
    expect(
      buildCategorySession("midterms", pool, ["multiple-choice", "search-select"]),
    ).toHaveLength(SESSION_LENGTH);
    expect(buildCategorySession("midterms", pool, ["multiple-choice"])).toHaveLength(SESSION_LENGTH);
    expect(buildCategorySession("midterms", pool, ["search-select"])).toHaveLength(SESSION_LENGTH);
  });
});
