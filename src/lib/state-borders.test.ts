import { describe, it, expect } from "vitest";
import { getStateNeighborAbbrs } from "./state-borders";

describe("getStateNeighborAbbrs", () => {
  it("never returns a state as its own neighbor", () => {
    // Regression guard: Oregon's us-atlas geometry shares an arc with itself (an island/
    // multipolygon artifact), which topojson-client's neighbors() doesn't filter out on its own.
    expect(getStateNeighborAbbrs("OR")).not.toContain("OR");
  });

  it("still returns Oregon's 4 real neighbors after filtering out the self-reference", () => {
    expect(getStateNeighborAbbrs("OR").sort()).toEqual(["CA", "ID", "NV", "WA"]);
  });
});
