import { describe, it, expect } from "vitest";
import { buildGovernorQuestions, buildLegislatorPhotoQuestions } from "./officeholders-questions";
import type { GovernorFact } from "@/lib/governors-data";
import type { LegislatorStateFact } from "@/lib/legislators-data";

function makeGovernorFacts(n: number): GovernorFact[] {
  return Array.from({ length: n }, (_, i) => ({
    stateId: `S${i}`,
    stateName: `State${i}`,
    governorName: `Governor${i}`,
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
});

describe("buildLegislatorPhotoQuestions", () => {
  it("builds the requested number of questions", () => {
    const questions = buildLegislatorPhotoQuestions(makeLegislatorFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("uses the subject's photo as the image and state names as options", () => {
    const facts = makeLegislatorFacts(10);
    const questions = buildLegislatorPhotoQuestions(facts, 5);
    for (const q of questions) {
      expect(q.imageUrl).toMatch(/^https:\/\/example\.com\/photo\d+\.png$/);
      const correctOption = q.options[q.correctIndex];
      const matchingFact = facts.find((f) => f.stateName === correctOption);
      expect(matchingFact?.photoUrl).toBe(q.imageUrl);
    }
  });

  it("phrases the prompt by chamber (senator/representative), not by name", () => {
    const facts = makeLegislatorFacts(10);
    const questions = buildLegislatorPhotoQuestions(facts, 5);
    for (const q of questions) {
      expect(q.prompt).toMatch(/^Which state is this (senator|representative) from\?$/);
      const correctOption = q.options[q.correctIndex];
      const matchingFact = facts.find((f) => f.stateName === correctOption);
      const expectedNoun = matchingFact?.chamber === "senate" ? "senator" : "representative";
      expect(q.prompt).toBe(`Which state is this ${expectedNoun} from?`);
    }
  });

  it("shows the legislator's name and party as the image caption", () => {
    const facts = makeLegislatorFacts(10);
    const questions = buildLegislatorPhotoQuestions(facts, 5);
    for (const q of questions) {
      const correctOption = q.options[q.correctIndex];
      const matchingFact = facts.find((f) => f.stateName === correctOption);
      expect(q.imageCaption).toBe(matchingFact?.legislatorName);
      expect(q.imageCaptionParty).toBe(matchingFact?.party);
    }
  });
});
