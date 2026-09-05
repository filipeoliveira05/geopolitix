import { describe, it, expect } from "vitest";
import {
  buildGovernorQuestions,
  buildOfficeholderPhotoQuestions,
  buildOfficeholderPartyQuestions,
  buildOfficeholderNameQuestions,
  buildChamberQuestions,
  buildHouseSeatCountQuestions,
  buildSenatorRecallQuestions,
} from "./officeholders-questions";
import type { GovernorFact } from "@/lib/governors-data";
import type { LegislatorStateFact, TermWithLegislator } from "@/lib/legislators-data";
import type { HouseSeatCountFact } from "@/lib/districts-data";
import type { StateFact } from "@/lib/geography-data";

function makeHouseSeatCountFacts(n: number): HouseSeatCountFact[] {
  return Array.from({ length: n }, (_, i) => ({
    stateId: `S${i}`,
    stateName: `State${i}`,
    seatCount: i + 1,
  }));
}

function makeGovernorFacts(n: number): GovernorFact[] {
  return Array.from({ length: n }, (_, i) => ({
    stateId: `S${i}`,
    stateName: `State${i}`,
    governorName: `Governor${i}`,
    photoUrl: `https://example.com/governor-photo${i}.png`,
    party: i % 2 === 0 ? "Democrat" : "Republican",
  }));
}

function makeLegislatorFacts(n: number): LegislatorStateFact[] {
  return Array.from({ length: n }, (_, i) => ({
    legislatorId: `L${i}`,
    legislatorName: `Legislator${i}`,
    party: i % 2 === 0 ? "Democrat" : "Republican",
    chamber: i % 2 === 0 ? "senate" : "house",
    photoUrl: `https://example.com/photo${i}.png`,
    stateId: `S${i}`,
    stateName: `State${i}`,
  }));
}

describe("buildGovernorQuestions", () => {
  it("builds the requested number of questions", () => {
    const questions = buildGovernorQuestions(makeGovernorFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("does not repeat a subject state across the session", () => {
    const questions = buildGovernorQuestions(makeGovernorFacts(10), 5);
    expect(new Set(questions.map((q) => q.prompt)).size).toBe(5);
  });

  it("phrases the prompt naming the subject state, with the correct governor among 4 options", () => {
    const [q] = buildGovernorQuestions(makeGovernorFacts(10), 1);
    expect(q.prompt).toMatch(/^Who is the current governor of State\d+\?$/);
    expect(q.options).toHaveLength(4);
    expect(q.options[q.correctIndex]).toMatch(/^Governor\d+$/);
  });

  it("has no image (governor questions are text-only)", () => {
    const [q] = buildGovernorQuestions(makeGovernorFacts(10), 1);
    expect(q.imageUrl).toBeNull();
  });

  it("sets the correct governor's photo/name as the reveal image, shown only after answering", () => {
    const facts = makeGovernorFacts(10);
    const questions = buildGovernorQuestions(facts, 5);
    for (const q of questions) {
      const correctOption = q.options[q.correctIndex];
      const matchingFact = facts.find((f) => f.governorName === correctOption);
      expect(q.revealImageUrl).toBe(matchingFact?.photoUrl);
      expect(q.revealCaption).toBe(matchingFact?.governorName);
    }
  });
});

describe("buildOfficeholderPhotoQuestions", () => {
  it("builds the requested number of questions from the combined legislator+governor pool", () => {
    const questions = buildOfficeholderPhotoQuestions(makeLegislatorFacts(10), makeGovernorFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("uses the subject's photo as the image and state names as options", () => {
    const legislators = makeLegislatorFacts(10);
    const governors = makeGovernorFacts(10);
    const questions = buildOfficeholderPhotoQuestions(legislators, governors, 10);
    for (const q of questions) {
      expect(q.imageUrl).toMatch(/^https:\/\/example\.com\/(photo|governor-photo)\d+\.png$/);
    }
  });

  it("phrases the prompt by role (senator/representative/governor)", () => {
    const legislators = makeLegislatorFacts(10);
    const governors = makeGovernorFacts(10);
    const questions = buildOfficeholderPhotoQuestions(legislators, governors, 10);
    for (const q of questions) {
      expect(q.prompt).toMatch(/^Which state is this (senator|representative|governor) from\?$/);
    }
  });

  it("shows the officeholder's name and party as the image caption", () => {
    const legislators = makeLegislatorFacts(10);
    const governors: GovernorFact[] = [];
    const questions = buildOfficeholderPhotoQuestions(legislators, governors, 5);
    for (const q of questions) {
      const matchingFact = legislators.find((f) => f.photoUrl === q.imageUrl);
      expect(q.imageCaption).toBe(matchingFact?.legislatorName);
      expect(q.imageCaptionParty).toBe(matchingFact?.party);
    }
  });

  it("excludes governors with no synced photo from the pool", () => {
    const governors = makeGovernorFacts(6).map((g, i) => (i === 0 ? { ...g, photoUrl: null } : g));
    const questions = buildOfficeholderPhotoQuestions([], governors, 2);
    expect(questions).toHaveLength(2);
    for (const q of questions) {
      expect(q.imageUrl).not.toBeNull();
      const matchingFact = governors.find((g) => g.photoUrl === q.imageUrl);
      expect(q.imageCaption).toBe(matchingFact?.governorName);
    }
  });
});

describe("buildOfficeholderPartyQuestions", () => {
  it("builds the requested number of questions from the combined legislator+governor pool", () => {
    const questions = buildOfficeholderPartyQuestions(makeLegislatorFacts(10), makeGovernorFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("phrases the prompt naming the officeholder's role and state", () => {
    const legislators = makeLegislatorFacts(10);
    const governors = makeGovernorFacts(10);
    const questions = buildOfficeholderPartyQuestions(legislators, governors, 10);
    for (const q of questions) {
      expect(q.prompt).toMatch(
        /^What party is (Senator|Representative|Governor) \w+\d+ of State\d+\?$/,
      );
    }
  });

  it("renders options as parties, with only real party values (no fixed 4-option padding)", () => {
    const legislators = makeLegislatorFacts(10); // Democrat/Republican only
    const questions = buildOfficeholderPartyQuestions(legislators, [], 5);
    for (const q of questions) {
      expect(q.optionsAreParties).toBe(true);
      expect(q.options.length).toBe(2);
      expect(["Democrat", "Republican"]).toContain(q.options[q.correctIndex]);
    }
  });

  it("shows the officeholder's photo and name, but no party badge (would spoil the answer)", () => {
    const legislators = makeLegislatorFacts(10);
    const questions = buildOfficeholderPartyQuestions(legislators, [], 5);
    for (const q of questions) {
      expect(q.imageUrl).toMatch(/^https:\/\/example\.com\/photo\d+\.png$/);
      expect(q.imageCaptionParty).toBeUndefined();
    }
  });

  it("excludes officeholders with no known party", () => {
    const legislators = makeLegislatorFacts(6).map((f, i) => (i === 0 ? { ...f, party: null } : f));
    const questions = buildOfficeholderPartyQuestions(legislators, [], 3);
    for (const q of questions) {
      expect(q.imageCaption).not.toBe("Legislator0");
    }
  });
});

/** 4 legislators (2 senators, 2 reps) all representing the same state, for same-state-distractor tests. */
function makeSameStateLegislators(stateId: string, stateName: string): LegislatorStateFact[] {
  return ["senate", "senate", "house", "house"].map((chamber, i) => ({
    legislatorId: `${stateId}-L${i}`,
    legislatorName: `${stateId}Legislator${i}`,
    party: i % 2 === 0 ? "Democrat" : "Republican",
    chamber: chamber as "senate" | "house",
    photoUrl: `https://example.com/${stateId}-photo${i}.png`,
    stateId,
    stateName,
  }));
}

describe("buildOfficeholderNameQuestions", () => {
  it("builds the requested number of questions from the combined legislator+governor pool", () => {
    const questions = buildOfficeholderNameQuestions(makeLegislatorFacts(10), makeGovernorFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("phrases the prompt without implying a state has only one senator/representative", () => {
    const legislators = makeSameStateLegislators("SX", "StateX");
    const questions = buildOfficeholderNameQuestions(legislators, [], 4);
    for (const q of questions) {
      expect(q.prompt).toMatch(
        /^This is one of the U\.S\. Senators from StateX\. Who is it\?$|^This is one of StateX's U\.S\. Representatives\. Who is it\?$/,
      );
      expect(q.imageUrl).toMatch(/^https:\/\/example\.com\/SX-photo\d+\.png$/);
    }
  });

  it("phrases the governor prompt as unique, since a state has only one", () => {
    const governors = makeGovernorFacts(10);
    const questions = buildOfficeholderNameQuestions([], governors, 10);
    for (const q of questions) {
      const matchingFact = governors.find((g) => g.photoUrl === q.imageUrl);
      expect(q.prompt).toBe(`This is the governor of ${matchingFact?.stateName}. Who is it?`);
    }
  });

  it("draws distractors from the same state when it has at least 3 other officeholders", () => {
    const sameState = makeSameStateLegislators("SX", "StateX");
    const governor: GovernorFact = {
      stateId: "SX",
      stateName: "StateX",
      governorName: "SXGovernor",
      photoUrl: "https://example.com/SX-governor.png",
      party: "Democrat",
    };
    // Plenty of other-state noise that should NOT be picked once same-state has enough options.
    const otherStates = makeLegislatorFacts(30);
    const questions = buildOfficeholderNameQuestions([...sameState, ...otherStates], [governor], 4);
    for (const q of questions) {
      if (!q.prompt.includes("StateX")) continue;
      for (const option of q.options) {
        expect(option).toMatch(/^SX/);
      }
    }
  });

  it("falls back to the nationwide pool when a state has fewer than 3 other officeholders", () => {
    // makeLegislatorFacts gives every legislator a distinct state, so no subject ever has 3
    // same-state co-officeholders — every question must fall back to nationwide distractors.
    const legislators = makeLegislatorFacts(10);
    const questions = buildOfficeholderNameQuestions(legislators, [], 5);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
    }
  });
});

describe("buildChamberQuestions", () => {
  it("builds the requested number of questions", () => {
    const questions = buildChamberQuestions(makeLegislatorFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("asks a fixed, name/state-agnostic prompt with only 2 options (Senate/House)", () => {
    const facts = makeLegislatorFacts(10);
    const questions = buildChamberQuestions(facts, 5);
    for (const q of questions) {
      expect(q.prompt).toBe("Which chamber of Congress does this legislator serve in?");
      expect(q.options).toHaveLength(2);
      expect(new Set(q.options)).toEqual(new Set(["U.S. Senate", "U.S. House of Representatives"]));
    }
  });

  it("maps the subject's actual chamber to the correct option", () => {
    const facts = makeLegislatorFacts(10);
    const questions = buildChamberQuestions(facts, 10);
    for (const q of questions) {
      const matchingFact = facts.find((f) => f.legislatorName === q.imageCaption);
      const expectedOption = matchingFact?.chamber === "senate" ? "U.S. Senate" : "U.S. House of Representatives";
      expect(q.options[q.correctIndex]).toBe(expectedOption);
    }
  });

  it("shows the legislator's photo, name, and party as the caption (none of it hints at chamber)", () => {
    const facts = makeLegislatorFacts(10);
    const questions = buildChamberQuestions(facts, 5);
    for (const q of questions) {
      expect(q.imageUrl).toMatch(/^https:\/\/example\.com\/photo\d+\.png$/);
      const matchingFact = facts.find((f) => f.legislatorName === q.imageCaption);
      expect(q.imageCaptionParty).toBe(matchingFact?.party);
    }
  });
});

describe("buildHouseSeatCountQuestions", () => {
  it("builds the requested number of questions", () => {
    const questions = buildHouseSeatCountQuestions(makeHouseSeatCountFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("phrases the prompt naming the subject state, with the correct seat count among 4 options", () => {
    const facts = makeHouseSeatCountFacts(10);
    const [q] = buildHouseSeatCountQuestions(facts, 1);
    expect(q.prompt).toMatch(/^How many U\.S\. House seats does State\d+ have\?$/);
    expect(q.options).toHaveLength(4);
    const stateName = q.prompt.match(/does (State\d+) have/)?.[1];
    const matchingFact = facts.find((f) => f.stateName === stateName);
    expect(q.options[q.correctIndex]).toBe(String(matchingFact?.seatCount));
  });

  it("has no image (a seat count has nothing to show a photo of)", () => {
    const [q] = buildHouseSeatCountQuestions(makeHouseSeatCountFacts(10), 1);
    expect(q.imageUrl).toBeNull();
  });
});

function makeStateFacts(n: number): StateFact[] {
  return Array.from({ length: n }, (_, i) => ({
    stateId: `S${i}`,
    stateName: `State${i}`,
    capitalName: `Capital${i}`,
    flagUrl: `https://example.com/flag${i}.png`,
    population: 1000 + i,
  }));
}

function makeSenator(id: string, firstName: string, lastName: string, stateId: string): TermWithLegislator {
  return {
    legislator: {
      id,
      bioguideId: id,
      govtrackId: null,
      firstName,
      lastName,
      photoUrl: null,
      birthday: null,
      bioSummary: null,
      wikipediaTitle: null,
      wikipediaVerified: false,
      wikipediaCheckedNo: false,
      lastSyncedAt: null,
    },
    term: {
      id: `${id}-term`,
      legislatorId: id,
      chamber: "senate",
      stateId,
      district: null,
      party: "Democrat",
      startDate: "2023-01-03",
      endDate: null,
      isCurrent: true,
    },
  };
}

describe("buildSenatorRecallQuestions", () => {
  it("builds the requested number of questions", () => {
    const senatorsByState = new Map([
      ["S0", [makeSenator("L0", "Amy", "Adams", "S0"), makeSenator("L1", "Bob", "Baker", "S0")]],
      ["S1", [makeSenator("L2", "Cara", "Cole", "S1"), makeSenator("L3", "Dan", "Diaz", "S1")]],
    ]);
    const questions = buildSenatorRecallQuestions(senatorsByState, makeStateFacts(2), 2);
    expect(questions).toHaveLength(2);
  });

  it("sorts the two senators alphabetically by full name", () => {
    const senatorsByState = new Map([
      ["S0", [makeSenator("L1", "Zeb", "Zorn", "S0"), makeSenator("L0", "Amy", "Adams", "S0")]],
    ]);
    const [q] = buildSenatorRecallQuestions(senatorsByState, makeStateFacts(1), 1);
    expect(q.targets.map((t) => t.label)).toEqual(["Amy Adams", "Zeb Zorn"]);
  });

  it("handles a 1-senator state (vacancy) without breaking", () => {
    const senatorsByState = new Map([["S0", [makeSenator("L0", "Amy", "Adams", "S0")]]]);
    const [q] = buildSenatorRecallQuestions(senatorsByState, makeStateFacts(1), 1);
    expect(q.targets).toEqual([{ id: "L0", label: "Amy Adams" }]);
  });

  it("excludes a state with zero current senators", () => {
    const senatorsByState = new Map([
      ["S0", [makeSenator("L0", "Amy", "Adams", "S0")]],
      ["S1", []],
    ]);
    const questions = buildSenatorRecallQuestions(senatorsByState, makeStateFacts(2), 1);
    expect(questions[0].prompt).toBe("Name State0's current U.S. Senators.");
  });

  it("uses the state's flag/name and sets entityType to senator", () => {
    const senatorsByState = new Map([["S0", [makeSenator("L0", "Amy", "Adams", "S0")]]]);
    const [q] = buildSenatorRecallQuestions(senatorsByState, makeStateFacts(1), 1);
    expect(q.imageUrl).toBe("https://example.com/flag0.png");
    expect(q.format).toBe("search-select");
    expect(q.entityType).toBe("senator");
    expect(q.prompt).toBe("Name State0's current U.S. Senators.");
  });
});
