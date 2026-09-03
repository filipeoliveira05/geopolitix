import { describe, it, expect } from "vitest";
import { pickRandom, randomSplit } from "./random";

describe("pickRandom", () => {
  it("returns the requested count of items", () => {
    const result = pickRandom([1, 2, 3, 4, 5], 3);
    expect(result).toHaveLength(3);
  });

  it("returns distinct items (no repeats)", () => {
    const result = pickRandom([1, 2, 3, 4, 5], 5);
    expect(new Set(result).size).toBe(5);
  });

  it("returns items only from the input array", () => {
    const items = ["a", "b", "c"];
    const result = pickRandom(items, 2);
    for (const item of result) {
      expect(items).toContain(item);
    }
  });

  it("throws when count exceeds the pool size", () => {
    expect(() => pickRandom([1, 2], 3)).toThrow();
  });

  it("returns every item when count equals the pool size (full shuffle)", () => {
    const items = [1, 2, 3];
    const result = pickRandom(items, 3);
    expect([...result].sort()).toEqual([1, 2, 3]);
  });

  it("does not mutate the input array", () => {
    const items = [1, 2, 3, 4, 5];
    const copy = [...items];
    pickRandom(items, 3);
    expect(items).toEqual(copy);
  });
});

describe("randomSplit", () => {
  it("returns parts that sum to total", () => {
    for (let i = 0; i < 50; i++) {
      const counts = randomSplit(10, 3);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(10);
    }
  });

  it("returns the requested number of parts", () => {
    expect(randomSplit(10, 3)).toHaveLength(3);
  });

  it("gives every part at least 1", () => {
    for (let i = 0; i < 50; i++) {
      const counts = randomSplit(10, 3);
      for (const count of counts) {
        expect(count).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("varies the split across calls (not a fixed even/thirds division)", () => {
    const splits = new Set<string>();
    for (let i = 0; i < 30; i++) {
      splits.add(randomSplit(10, 3).join(","));
    }
    expect(splits.size).toBeGreaterThan(1);
  });

  it("returns [total] for a single part", () => {
    expect(randomSplit(7, 1)).toEqual([7]);
  });

  it("returns all 1s when total equals parts", () => {
    expect(randomSplit(3, 3)).toEqual([1, 1, 1]);
  });

  it("throws when total is less than parts", () => {
    expect(() => randomSplit(2, 3)).toThrow();
  });

  it("throws when parts is less than 1", () => {
    expect(() => randomSplit(5, 0)).toThrow();
  });
});
