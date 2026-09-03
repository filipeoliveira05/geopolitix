import { describe, it, expect } from "vitest";
import {
  candidateFactsFromRaces,
  buildCandidatePartyQuestions,
  buildIncumbencyQuestions,
  type CandidateFact,
} from "./midterms-questions";
import type { Race } from "@/lib/races-data";

function makeRace(overrides: Partial<Race> & { candidates: Race["candidates"] }): Race {
  return {
    id: "race-1",
    office: "senate",
    stateId: "TX",
    districtNumber: null,
    status: "open",
    winnerCandidateId: null,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<Race["candidates"][number]>): Race["candidates"][number] {
  return {
    id: "c1",
    name: "Jane Smith",
    party: "Democrat",
    isIncumbent: false,
    matchedLegislatorId: null,
    matchedGovernorId: null,
    candidateId: null,
    ...overrides,
  };
}

describe("candidateFactsFromRaces", () => {
  it("keeps a real candidate with a known party", () => {
    const races = [makeRace({ candidates: [makeCandidate({})] })];
    const facts = candidateFactsFromRaces(races);
    expect(facts).toEqual([{ name: "Jane Smith", party: "Democrat", isIncumbent: false }]);
  });

  it("drops a placeholder 'TBD' candidate", () => {
    const races = [makeRace({ candidates: [makeCandidate({ name: "TBD" })] })];
    expect(candidateFactsFromRaces(races)).toHaveLength(0);
  });

  it("drops a placeholder '(presumptive)' candidate", () => {
    const races = [makeRace({ candidates: [makeCandidate({ name: "Jane Smith (presumptive)" })] })];
    expect(candidateFactsFromRaces(races)).toHaveLength(0);
  });

  it("drops a candidate with no known party", () => {
    const races = [makeRace({ candidates: [makeCandidate({ party: null })] })];
    expect(candidateFactsFromRaces(races)).toHaveLength(0);
  });

  it("flattens candidates across multiple races", () => {
    const races = [
      makeRace({ id: "r1", candidates: [makeCandidate({ id: "c1", name: "A" })] }),
      makeRace({ id: "r2", candidates: [makeCandidate({ id: "c2", name: "B" })] }),
    ];
    expect(candidateFactsFromRaces(races).map((f) => f.name)).toEqual(["A", "B"]);
  });
});

const twoPartyFacts: CandidateFact[] = Array.from({ length: 10 }, (_, i) => ({
  name: `Candidate${i}`,
  party: i % 2 === 0 ? "Democrat" : "Republican",
  isIncumbent: i % 3 === 0,
}));

describe("buildCandidatePartyQuestions", () => {
  it("builds the requested number of questions", () => {
    expect(buildCandidatePartyQuestions(twoPartyFacts, 5)).toHaveLength(5);
  });

  it("offers only as many options as there are distinct real party values (2 here, not 4)", () => {
    const questions = buildCandidatePartyQuestions(twoPartyFacts, 5);
    for (const q of questions) {
      expect(q.options).toHaveLength(2);
      expect(new Set(q.options)).toEqual(new Set(["Democrat", "Republican"]));
    }
  });

  it("has the subject's real party as the correct answer", () => {
    const questions = buildCandidatePartyQuestions(twoPartyFacts, 5);
    for (const q of questions) {
      const subjectName = q.prompt.match(/^What party is (.+) running as\?$/)?.[1];
      const subject = twoPartyFacts.find((f) => f.name === subjectName);
      expect(q.options[q.correctIndex]).toBe(subject?.party);
    }
  });
});

describe("buildIncumbencyQuestions", () => {
  it("builds the requested number of questions", () => {
    expect(buildIncumbencyQuestions(twoPartyFacts, 5)).toHaveLength(5);
  });

  it("always offers exactly Yes/No as options", () => {
    const questions = buildIncumbencyQuestions(twoPartyFacts, 5);
    for (const q of questions) {
      expect(q.options).toEqual(["Yes", "No"]);
    }
  });

  it("marks Yes correct for an incumbent, No correct for a non-incumbent", () => {
    const incumbent: CandidateFact = { name: "Inc", party: "Democrat", isIncumbent: true };
    const challenger: CandidateFact = { name: "Chal", party: "Republican", isIncumbent: false };
    const [incQ] = buildIncumbencyQuestions([incumbent], 1);
    const [chalQ] = buildIncumbencyQuestions([challenger], 1);
    expect(incQ.options[incQ.correctIndex]).toBe("Yes");
    expect(chalQ.options[chalQ.correctIndex]).toBe("No");
  });
});
