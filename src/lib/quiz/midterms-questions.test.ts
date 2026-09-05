import { describe, it, expect } from "vitest";
import {
  candidateFactsFromRaces,
  buildCandidatePartyQuestions,
  buildIncumbencyQuestions,
  buildRaceCandidateRecallQuestions,
  type CandidateFact,
} from "./midterms-questions";
import type { Race } from "@/lib/races-data";
import type { StateFact } from "@/lib/geography-data";

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
    photoUrl: null,
    ...overrides,
  };
}

describe("candidateFactsFromRaces", () => {
  it("keeps a real candidate with a known party, carrying the race's state/office/district", () => {
    const races = [makeRace({ candidates: [makeCandidate({})] })];
    const facts = candidateFactsFromRaces(races);
    expect(facts).toEqual([
      {
        name: "Jane Smith",
        party: "Democrat",
        isIncumbent: false,
        stateName: "Texas",
        office: "senate",
        districtNumber: null,
        photoUrl: null,
      },
    ]);
  });

  it("carries the candidate's photo through as photoUrl", () => {
    const races = [
      makeRace({ candidates: [makeCandidate({ photoUrl: "https://example.com/jane.png" })] }),
    ];
    expect(candidateFactsFromRaces(races)[0].photoUrl).toBe("https://example.com/jane.png");
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
  stateName: "Texas",
  office: "senate",
  districtNumber: null,
  photoUrl: `https://example.com/candidate${i}.png`,
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

  it("names the race (state/office) in the prompt, same as the incumbency question", () => {
    const [q] = buildCandidatePartyQuestions(twoPartyFacts, 1);
    expect(q.prompt).toMatch(/^What party is Candidate\d+ running as in the Texas Senate race\?$/);
  });

  it("flags optionsAreParties so the view renders a party badge on each option", () => {
    const [q] = buildCandidatePartyQuestions(twoPartyFacts, 1);
    expect(q.optionsAreParties).toBe(true);
  });

  it("has the subject's real party as the correct answer", () => {
    const questions = buildCandidatePartyQuestions(twoPartyFacts, 5);
    for (const q of questions) {
      const subjectName = q.prompt.match(/^What party is (.+) running as in the .+ race\?$/)?.[1];
      const subject = twoPartyFacts.find((f) => f.name === subjectName);
      expect(q.options[q.correctIndex]).toBe(subject?.party);
    }
  });

  it("shows the subject's photo/name immediately (not gated behind answering), with no party badge", () => {
    const questions = buildCandidatePartyQuestions(twoPartyFacts, 5);
    for (const q of questions) {
      const subjectName = q.prompt.match(/^What party is (.+) running as in the .+ race\?$/)?.[1];
      const subject = twoPartyFacts.find((f) => f.name === subjectName);
      expect(q.imageUrl).toBe(subject?.photoUrl);
      expect(q.imageCaption).toBe(subjectName);
      expect(q.imageCaptionParty).toBeUndefined();
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

  it("names the state/office (and district, for House) in the prompt", () => {
    const senate: CandidateFact = {
      name: "Inc",
      party: "Democrat",
      isIncumbent: true,
      stateName: "Texas",
      office: "senate",
      districtNumber: null,
      photoUrl: null,
    };
    const houseAtLarge: CandidateFact = {
      name: "Chal",
      party: "Republican",
      isIncumbent: false,
      stateName: "Wyoming",
      office: "house",
      districtNumber: 0,
      photoUrl: null,
    };
    const houseDistrict: CandidateFact = {
      name: "Rep",
      party: "Democrat",
      isIncumbent: true,
      stateName: "Texas",
      office: "house",
      districtNumber: 3,
      photoUrl: null,
    };
    const [senateQ] = buildIncumbencyQuestions([senate], 1);
    const [houseAtLargeQ] = buildIncumbencyQuestions([houseAtLarge], 1);
    const [houseDistrictQ] = buildIncumbencyQuestions([houseDistrict], 1);
    expect(senateQ.prompt).toBe("Is Inc the incumbent in the Texas Senate race?");
    expect(houseAtLargeQ.prompt).toBe("Is Chal the incumbent in the Wyoming House race?");
    expect(houseDistrictQ.prompt).toBe("Is Rep the incumbent in the Texas House District 3 race?");
  });

  it("marks Yes correct for an incumbent, No correct for a non-incumbent", () => {
    const incumbent: CandidateFact = {
      name: "Inc",
      party: "Democrat",
      isIncumbent: true,
      stateName: "Texas",
      office: "senate",
      districtNumber: null,
      photoUrl: null,
    };
    const challenger: CandidateFact = {
      name: "Chal",
      party: "Republican",
      isIncumbent: false,
      stateName: "Texas",
      office: "senate",
      districtNumber: null,
      photoUrl: null,
    };
    const [incQ] = buildIncumbencyQuestions([incumbent], 1);
    const [chalQ] = buildIncumbencyQuestions([challenger], 1);
    expect(incQ.options[incQ.correctIndex]).toBe("Yes");
    expect(chalQ.options[chalQ.correctIndex]).toBe("No");
  });

  it("shows the subject's photo/name/party immediately (not gated behind answering)", () => {
    const subject: CandidateFact = {
      name: "Inc",
      party: "Democrat",
      isIncumbent: true,
      stateName: "Texas",
      office: "senate",
      districtNumber: null,
      photoUrl: "https://example.com/inc.png",
    };
    const [q] = buildIncumbencyQuestions([subject], 1);
    expect(q.imageUrl).toBe("https://example.com/inc.png");
    expect(q.imageCaption).toBe("Inc");
    expect(q.imageCaptionParty).toBe("Democrat");
  });
});

function makeStateFacts(stateIds: string[]): StateFact[] {
  return stateIds.map((stateId, i) => ({
    stateId,
    stateName: `${stateId}Name`,
    capitalName: `${stateId}Capital`,
    flagUrl: `https://example.com/flag-${stateId}.png`,
    population: 1000 + i,
  }));
}

describe("buildRaceCandidateRecallQuestions", () => {
  it("builds the requested number of questions", () => {
    const races = [
      makeRace({ id: "r1", candidates: [makeCandidate({ id: "c1", name: "A" })] }),
      makeRace({
        id: "r2",
        stateId: "CA",
        office: "governor",
        candidates: [makeCandidate({ id: "c2", name: "B" })],
      }),
    ];
    const questions = buildRaceCandidateRecallQuestions(races, makeStateFacts(["TX", "CA"]), 2);
    expect(questions).toHaveLength(2);
  });

  it("sorts targets alphabetically by candidate name", () => {
    const races = [
      makeRace({
        candidates: [
          makeCandidate({ id: "c1", name: "Zed" }),
          makeCandidate({ id: "c2", name: "Amy" }),
        ],
      }),
    ];
    const [q] = buildRaceCandidateRecallQuestions(races, makeStateFacts(["TX"]), 1);
    expect(q.targets.map((t) => t.label)).toEqual(["Amy", "Zed"]);
  });

  it("carries each candidate's real party on their target, for the party badge shown once found", () => {
    const races = [
      makeRace({
        candidates: [
          makeCandidate({ id: "c1", name: "Amy", party: "Democrat" }),
          makeCandidate({ id: "c2", name: "Zed", party: "Republican" }),
        ],
      }),
    ];
    const [q] = buildRaceCandidateRecallQuestions(races, makeStateFacts(["TX"]), 1);
    expect(q.targets.find((t) => t.label === "Amy")?.party).toBe("Democrat");
    expect(q.targets.find((t) => t.label === "Zed")?.party).toBe("Republican");
  });

  it("excludes placeholder TBD/(presumptive) candidates from targets", () => {
    const races = [
      makeRace({
        candidates: [
          makeCandidate({ id: "c1", name: "Real Name" }),
          makeCandidate({ id: "c2", name: "TBD" }),
          makeCandidate({ id: "c3", name: "Fake Name (presumptive)" }),
        ],
      }),
    ];
    const [q] = buildRaceCandidateRecallQuestions(races, makeStateFacts(["TX"]), 1);
    expect(q.targets.map((t) => t.label)).toEqual(["Real Name"]);
  });

  it("excludes a race with zero real candidates entirely", () => {
    const races = [
      makeRace({ id: "r1", stateId: "TX", candidates: [makeCandidate({ name: "TBD" })] }),
      makeRace({ id: "r2", stateId: "CA", candidates: [makeCandidate({ id: "c2", name: "Real" })] }),
    ];
    const [q] = buildRaceCandidateRecallQuestions(races, makeStateFacts(["TX", "CA"]), 1);
    expect(q.prompt).toContain("CAName");
  });

  it("names the office (Senate/Governor) and state in the prompt", () => {
    const senateRace = makeRace({ stateId: "TX", office: "senate", candidates: [makeCandidate({})] });
    const governorRace = makeRace({
      stateId: "TX",
      office: "governor",
      candidates: [makeCandidate({})],
    });
    const [senateQ] = buildRaceCandidateRecallQuestions([senateRace], makeStateFacts(["TX"]), 1);
    const [governorQ] = buildRaceCandidateRecallQuestions([governorRace], makeStateFacts(["TX"]), 1);
    expect(senateQ.prompt).toBe("Name every candidate running for Senate in TXName.");
    expect(governorQ.prompt).toBe("Name every candidate running for Governor in TXName.");
  });

  it("uses the state's flag and sets format/entityType", () => {
    const [q] = buildRaceCandidateRecallQuestions(
      [makeRace({ stateId: "TX", candidates: [makeCandidate({})] })],
      makeStateFacts(["TX"]),
      1,
    );
    expect(q.imageUrl).toBe("https://example.com/flag-TX.png");
    expect(q.format).toBe("search-select");
    expect(q.entityType).toBe("candidate");
  });

  it("attaches a searchPool including the targets plus real candidates from other races", () => {
    const races = [
      makeRace({ id: "r1", stateId: "TX", candidates: [makeCandidate({ id: "c1", name: "Subject" })] }),
      makeRace({ id: "r2", stateId: "CA", candidates: [makeCandidate({ id: "c2", name: "Other" })] }),
    ];
    const questions = buildRaceCandidateRecallQuestions(races, makeStateFacts(["TX", "CA"]), 2);
    const txQuestion = questions.find((q) => q.prompt.includes("TXName"));
    expect(txQuestion?.searchPool?.map((e) => e.label)).toContain("Subject");
    expect(txQuestion?.searchPool?.map((e) => e.label)).toContain("Other");
  });

  it("carries party on searchPool entries too, not just targets (shown in the search dropdown)", () => {
    const races = [
      makeRace({
        id: "r1",
        stateId: "TX",
        candidates: [makeCandidate({ id: "c1", name: "Subject", party: "Democrat" })],
      }),
      makeRace({
        id: "r2",
        stateId: "CA",
        candidates: [makeCandidate({ id: "c2", name: "Other", party: "Republican" })],
      }),
    ];
    const questions = buildRaceCandidateRecallQuestions(races, makeStateFacts(["TX", "CA"]), 2);
    const txQuestion = questions.find((q) => q.prompt.includes("TXName"));
    expect(txQuestion?.searchPool?.find((e) => e.label === "Subject")?.party).toBe("Democrat");
    expect(txQuestion?.searchPool?.find((e) => e.label === "Other")?.party).toBe("Republican");
  });
});
