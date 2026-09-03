import { describe, it, expect } from "vitest";
import { buildCapitalQuestions, buildFlagQuestions, buildMapClickQuestions } from "./geography-questions";
import type { StateFact } from "@/lib/geography-data";

function makeFacts(n: number): StateFact[] {
  return Array.from({ length: n }, (_, i) => ({
    stateId: `S${i}`,
    stateName: `State${i}`,
    capitalName: `Capital${i}`,
    flagUrl: `https://example.com/flag${i}.png`,
  }));
}

describe("buildCapitalQuestions", () => {
  it("builds the requested number of questions", () => {
    const questions = buildCapitalQuestions(makeFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("does not repeat a subject state across the session", () => {
    const questions = buildCapitalQuestions(makeFacts(10), 5);
    const prompts = questions.map((q) => q.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("phrases the prompt as a capital question naming the subject state", () => {
    const [q] = buildCapitalQuestions(makeFacts(10), 1);
    expect(q.prompt).toMatch(/^What is the capital of State\d+\?$/);
  });

  it("has the correct capital among the 4 options", () => {
    const facts = makeFacts(10);
    const questions = buildCapitalQuestions(facts, 5);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(q.options[q.correctIndex]).toMatch(/^Capital\d+$/);
    }
  });

  it("has no image (capital questions are text-only)", () => {
    const [q] = buildCapitalQuestions(makeFacts(10), 1);
    expect(q.imageUrl).toBeNull();
  });
});

describe("buildFlagQuestions", () => {
  it("builds the requested number of questions", () => {
    const questions = buildFlagQuestions(makeFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("uses the subject state's flag as the image", () => {
    const facts = makeFacts(10);
    const questions = buildFlagQuestions(facts, 5);
    for (const q of questions) {
      expect(q.imageUrl).toMatch(/^https:\/\/example\.com\/flag\d+\.png$/);
    }
  });

  it("has state names as options, with the correct one matching the flag shown", () => {
    const facts = makeFacts(10);
    const questions = buildFlagQuestions(facts, 5);
    for (const q of questions) {
      const correctOption = q.options[q.correctIndex];
      const matchingFact = facts.find((f) => f.stateName === correctOption);
      expect(matchingFact).toBeDefined();
      expect(matchingFact?.flagUrl).toBe(q.imageUrl);
    }
  });

  it("uses the same generic prompt for every question", () => {
    const questions = buildFlagQuestions(makeFacts(10), 3);
    for (const q of questions) {
      expect(q.prompt).toBe("Which state does this flag belong to?");
    }
  });
});

describe("buildMapClickQuestions", () => {
  it("builds the requested number of questions", () => {
    const questions = buildMapClickQuestions(makeFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("does not repeat a target state across the session", () => {
    const questions = buildMapClickQuestions(makeFacts(10), 5);
    expect(new Set(questions.map((q) => q.targetStateId)).size).toBe(5);
  });

  it("phrases the prompt naming the target state, with matching targetStateId/targetStateName", () => {
    const [q] = buildMapClickQuestions(makeFacts(10), 1);
    expect(q.prompt).toBe(`Click on ${q.targetStateName}.`);
    expect(q.targetStateId).toMatch(/^S\d+$/);
    expect(q.targetStateName).toMatch(/^State\d+$/);
  });
});
