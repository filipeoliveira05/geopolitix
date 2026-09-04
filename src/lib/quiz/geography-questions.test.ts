import { describe, it, expect } from "vitest";
import {
  buildCapitalQuestions,
  buildFlagQuestions,
  buildMapClickQuestions,
  buildAbbreviationQuestions,
  buildCityStateQuestions,
} from "./geography-questions";
import type { StateFact, CityFact } from "@/lib/geography-data";

function makeCities(n: number): CityFact[] {
  return Array.from({ length: n }, (_, i) => ({
    cityId: `C${i}`,
    cityName: `City${i}`,
    stateId: `S${i}`,
    stateName: `State${i}`,
  }));
}

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

describe("buildAbbreviationQuestions", () => {
  it("builds the requested number of questions", () => {
    const questions = buildAbbreviationQuestions(makeFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("does not repeat a subject state across the session", () => {
    const questions = buildAbbreviationQuestions(makeFacts(10), 5);
    const prompts = questions.map((q) => q.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("phrases each prompt as either name-to-abbreviation or abbreviation-to-name, matching its own options", () => {
    const facts = makeFacts(10);
    const questions = buildAbbreviationQuestions(facts, 10);
    for (const q of questions) {
      const correctOption = q.options[q.correctIndex];
      if (/^What is the 2-letter abbreviation for /.test(q.prompt)) {
        expect(correctOption).toMatch(/^S\d+$/);
      } else {
        expect(q.prompt).toMatch(/^Which state has the abbreviation "S\d+"\?$/);
        expect(correctOption).toMatch(/^State\d+$/);
      }
    }
  });

  it("uses both directions across enough questions", () => {
    const facts = makeFacts(20);
    const questions = buildAbbreviationQuestions(facts, 20);
    const directions = new Set(
      questions.map((q) => (q.prompt.startsWith("What is the 2-letter abbreviation") ? "name" : "abbr")),
    );
    expect(directions.size).toBe(2);
  });

  it("has no image (abbreviation questions are text-only)", () => {
    const [q] = buildAbbreviationQuestions(makeFacts(10), 1);
    expect(q.imageUrl).toBeNull();
  });
});

describe("buildCityStateQuestions", () => {
  it("builds the requested number of questions", () => {
    const questions = buildCityStateQuestions(makeCities(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("does not repeat a subject city across the session", () => {
    const questions = buildCityStateQuestions(makeCities(10), 5);
    const prompts = questions.map((q) => q.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("phrases the prompt naming the subject city", () => {
    const [q] = buildCityStateQuestions(makeCities(10), 1);
    expect(q.prompt).toMatch(/^Which state is City\d+ in\?$/);
  });

  it("has the correct state among the options, matching the named city", () => {
    const cities = makeCities(10);
    const questions = buildCityStateQuestions(cities, 5);
    for (const q of questions) {
      const cityName = q.prompt.match(/^Which state is (\w+) in\?$/)?.[1];
      const matchingCity = cities.find((c) => c.cityName === cityName);
      expect(matchingCity).toBeDefined();
      expect(q.options[q.correctIndex]).toBe(matchingCity?.stateName);
    }
  });

  it("has no image (city-state questions are text-only)", () => {
    const [q] = buildCityStateQuestions(makeCities(10), 1);
    expect(q.imageUrl).toBeNull();
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
