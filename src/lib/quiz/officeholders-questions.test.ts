import { describe, it, expect } from "vitest";
import {
  buildGovernorQuestions,
  buildOfficeholderPhotoQuestions,
  buildOfficeholderPartyQuestions,
} from "./officeholders-questions";
import type { GovernorFact } from "@/lib/governors-data";
import type { LegislatorStateFact } from "@/lib/legislators-data";

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
