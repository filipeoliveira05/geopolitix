import { describe, it, expect } from "vitest";
import {
  buildCapitalQuestions,
  buildFlagQuestions,
  buildMapClickQuestions,
  buildAbbreviationQuestions,
  buildCityStateQuestions,
  buildLargestCityQuestions,
  buildIsCapitalQuestions,
  buildIsLargestCityQuestions,
} from "./geography-questions";
import type { StateFact, CityFact } from "@/lib/geography-data";

function makeCities(n: number): CityFact[] {
  return Array.from({ length: n }, (_, i) => ({
    cityId: `C${i}`,
    cityName: `City${i}`,
    stateId: `S${i}`,
    stateName: `State${i}`,
    population: 1000 + i,
    isCapital: false,
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

describe("buildLargestCityQuestions", () => {
  // citiesPerState cities per state, the last one always the most populous — the rest are
  // in-state decoys ("SmallCityN_j"), the last is the real largest city ("BigCityN").
  function makeCitiesWithDecoys(n: number, citiesPerState = 4): CityFact[] {
    const cities: CityFact[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < citiesPerState; j++) {
        const isLargest = j === citiesPerState - 1;
        cities.push({
          cityId: `${i}-${j}`,
          cityName: isLargest ? `BigCity${i}` : `SmallCity${i}_${j}`,
          stateId: `S${i}`,
          stateName: `State${i}`,
          population: isLargest ? 100000 : 100 + j,
          isCapital: false,
        });
      }
    }
    return cities;
  }

  it("builds the requested number of questions", () => {
    const questions = buildLargestCityQuestions(makeCitiesWithDecoys(10), makeFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("picks the higher-population city per state as the correct answer, not just any city", () => {
    const questions = buildLargestCityQuestions(makeCitiesWithDecoys(10), makeFacts(10), 10);
    for (const q of questions) {
      expect(q.options[q.correctIndex]).toMatch(/^BigCity\d+$/);
    }
  });

  it("phrases the prompt naming the subject state", () => {
    const [q] = buildLargestCityQuestions(makeCitiesWithDecoys(10), makeFacts(10), 1);
    expect(q.prompt).toMatch(/^What is the largest city in State\d+\?$/);
  });

  it("uses the subject state's flag as the image", () => {
    const questions = buildLargestCityQuestions(makeCitiesWithDecoys(10), makeFacts(10), 5);
    for (const q of questions) {
      const stateIndex = q.prompt.match(/State(\d+)\?$/)?.[1];
      expect(q.imageUrl).toBe(`https://example.com/flag${stateIndex}.png`);
    }
  });

  it("draws every option from the same state as the subject — no other state's city leaks in", () => {
    const questions = buildLargestCityQuestions(makeCitiesWithDecoys(10), makeFacts(10), 5);
    for (const q of questions) {
      const stateIndex = q.prompt.match(/State(\d+)\?$/)?.[1];
      for (const option of q.options) {
        expect(option).toMatch(new RegExp(`^(Big|Small)City${stateIndex}(_\\d+)?$`));
      }
    }
  });

  it("skips a state with fewer than 3 other synced cities", () => {
    const cities: CityFact[] = [
      {
        cityId: "a",
        cityName: "OnlyCity",
        stateId: "S0",
        stateName: "State0",
        population: 500,
        isCapital: false,
      },
      ...makeCitiesWithDecoys(5).filter((c) => c.stateId !== "S0"),
    ];
    const prompts = buildLargestCityQuestions(cities, makeFacts(6), 4).map((q) => q.prompt);
    expect(prompts).not.toContain("What is the largest city in State0?");
  });

  it("ignores cities with a null population when picking the largest", () => {
    const cities = makeCitiesWithDecoys(1).map((c) =>
      c.cityName === "BigCity0" ? { ...c, population: null } : c,
    );
    const [q] = buildLargestCityQuestions(cities, makeFacts(1), 1);
    expect(q.options[q.correctIndex]).not.toBe("BigCity0");
  });
});

describe("buildIsCapitalQuestions", () => {
  // One capital + 3 non-capitals per state, so every generated state has a real "No" pool to
  // draw from as well as its one "Yes" case.
  function makeCitiesWithCapitals(n: number): CityFact[] {
    const cities: CityFact[] = [];
    for (let i = 0; i < n; i++) {
      cities.push({
        cityId: `${i}-capital`,
        cityName: `Capital${i}`,
        stateId: `S${i}`,
        stateName: `State${i}`,
        population: 1000,
        isCapital: true,
      });
      for (let j = 0; j < 3; j++) {
        cities.push({
          cityId: `${i}-${j}`,
          cityName: `City${i}_${j}`,
          stateId: `S${i}`,
          stateName: `State${i}`,
          population: 2000 + j,
          isCapital: false,
        });
      }
    }
    return cities;
  }

  it("builds the requested number of questions", () => {
    const questions = buildIsCapitalQuestions(makeCitiesWithCapitals(10), makeFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("only produces a plain Yes/No option set", () => {
    const questions = buildIsCapitalQuestions(makeCitiesWithCapitals(10), makeFacts(10), 5);
    for (const q of questions) {
      expect(q.options).toEqual(["Yes", "No"]);
    }
  });

  it("answers Yes when naming the real capital, No when naming a non-capital city", () => {
    const questions = buildIsCapitalQuestions(makeCitiesWithCapitals(20), makeFacts(20), 20);
    for (const q of questions) {
      const cityName = q.prompt.match(/^Is (\S+) the capital/)?.[1];
      if (cityName?.startsWith("Capital")) {
        expect(q.correctIndex).toBe(0);
      } else {
        expect(q.correctIndex).toBe(1);
      }
    }
  });

  it("uses both Yes and No cases across enough questions", () => {
    const questions = buildIsCapitalQuestions(makeCitiesWithCapitals(20), makeFacts(20), 20);
    const correctIndices = new Set(questions.map((q) => q.correctIndex));
    expect(correctIndices.size).toBe(2);
  });

  it("skips a state with no synced capital", () => {
    const cities = [
      ...makeCitiesWithCapitals(2).filter((c) => c.stateId !== "S0" || !c.isCapital),
    ];
    const prompts = buildIsCapitalQuestions(cities, makeFacts(2), 1).map((q) => q.prompt);
    expect(prompts[0]).toContain("State1");
  });

  it("uses the subject state's flag as the image", () => {
    const questions = buildIsCapitalQuestions(makeCitiesWithCapitals(10), makeFacts(10), 5);
    for (const q of questions) {
      const stateIndex = q.prompt.match(/State(\d+)\?$/)?.[1];
      expect(q.imageUrl).toBe(`https://example.com/flag${stateIndex}.png`);
    }
  });

  it("skips a state whose flag is missing from the states pool", () => {
    const cities = makeCitiesWithCapitals(2);
    const statesMissingOneFlag = makeFacts(2).filter((s) => s.stateId !== "S0");
    const prompts = buildIsCapitalQuestions(cities, statesMissingOneFlag, 1).map((q) => q.prompt);
    expect(prompts[0]).toContain("State1");
  });
});

describe("buildIsLargestCityQuestions", () => {
  // Two cities per state — BigCityN is the real largest, SmallCityN is the decoy.
  function makeCities(n: number): CityFact[] {
    const cities: CityFact[] = [];
    for (let i = 0; i < n; i++) {
      cities.push({
        cityId: `${i}-big`,
        cityName: `BigCity${i}`,
        stateId: `S${i}`,
        stateName: `State${i}`,
        population: 100000,
        isCapital: false,
      });
      cities.push({
        cityId: `${i}-small`,
        cityName: `SmallCity${i}`,
        stateId: `S${i}`,
        stateName: `State${i}`,
        population: 100,
        isCapital: false,
      });
    }
    return cities;
  }

  it("builds the requested number of questions", () => {
    const questions = buildIsLargestCityQuestions(makeCities(10), makeFacts(10), 5);
    expect(questions).toHaveLength(5);
  });

  it("only produces a plain Yes/No option set", () => {
    const questions = buildIsLargestCityQuestions(makeCities(10), makeFacts(10), 5);
    for (const q of questions) {
      expect(q.options).toEqual(["Yes", "No"]);
    }
  });

  it("answers Yes when naming the real largest city, No when naming the smaller one", () => {
    const questions = buildIsLargestCityQuestions(makeCities(10), makeFacts(10), 10);
    for (const q of questions) {
      if (q.prompt.includes("BigCity")) {
        expect(q.correctIndex).toBe(0);
      } else {
        expect(q.correctIndex).toBe(1);
      }
    }
  });

  it("uses both Yes and No cases across enough questions", () => {
    const questions = buildIsLargestCityQuestions(makeCities(10), makeFacts(10), 10);
    const correctIndices = new Set(questions.map((q) => q.correctIndex));
    expect(correctIndices.size).toBe(2);
  });

  it("phrases the prompt naming the subject city and state, with no mention of a capital", () => {
    const [q] = buildIsLargestCityQuestions(makeCities(10), makeFacts(10), 1);
    expect(q.prompt).toMatch(/^Is (Big|Small)City\d+ the largest city in State\d+\?$/);
  });

  it("uses the subject state's flag as the image", () => {
    const questions = buildIsLargestCityQuestions(makeCities(10), makeFacts(10), 5);
    for (const q of questions) {
      const stateIndex = q.prompt.match(/State(\d+)\?$/)?.[1];
      expect(q.imageUrl).toBe(`https://example.com/flag${stateIndex}.png`);
    }
  });

  it("skips a state with only one synced city (nothing to compare it against)", () => {
    const cities = [
      { ...makeCities(2)[0] },
      ...makeCities(2).filter((c) => c.stateId !== "S0"),
    ];
    const prompts = buildIsLargestCityQuestions(cities, makeFacts(2), 1).map((q) => q.prompt);
    expect(prompts[0]).toContain("State1");
  });

  it("skips a state whose flag is missing from the states pool", () => {
    const cities = makeCities(2);
    const statesMissingOneFlag = makeFacts(2).filter((s) => s.stateId !== "S0");
    const prompts = buildIsLargestCityQuestions(cities, statesMissingOneFlag, 1).map(
      (q) => q.prompt,
    );
    expect(prompts[0]).toContain("State1");
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
