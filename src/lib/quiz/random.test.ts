import { describe, it, expect } from "vitest";
import { pickRandom } from "./random";

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
