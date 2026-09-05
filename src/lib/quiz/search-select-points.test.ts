import { describe, it, expect } from "vitest";
import { searchSelectPoints } from "./search-select-points";

describe("searchSelectPoints", () => {
  it("awards exactly 10 when everything is found", () => {
    expect(searchSelectPoints(10, 10)).toBe(10);
    expect(searchSelectPoints(2, 2)).toBe(10);
    expect(searchSelectPoints(1, 1)).toBe(10);
  });

  it("awards 0 when nothing is found", () => {
    expect(searchSelectPoints(0, 10)).toBe(0);
  });

  it("splits 10 points evenly for a partial result", () => {
    expect(searchSelectPoints(6, 10)).toBe(6);
    expect(searchSelectPoints(1, 2)).toBe(5);
  });

  it("never rounds a partial result up to a false 10", () => {
    // 19/20 -> 9.5 -> would naively round to 10 without the guard
    expect(searchSelectPoints(19, 20)).toBe(9);
  });

  it("returns 0 for a zero-target question (guards divide-by-zero)", () => {
    expect(searchSelectPoints(0, 0)).toBe(0);
  });
});
