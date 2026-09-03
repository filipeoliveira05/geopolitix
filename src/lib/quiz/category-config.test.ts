import { describe, it, expect } from "vitest";
import { QUIZ_CATEGORIES, getQuizCategory } from "./category-config";

describe("QUIZ_CATEGORIES", () => {
  it("has exactly 5 categories", () => {
    expect(QUIZ_CATEGORIES).toHaveLength(5);
  });

  it("has all 5 categories enabled", () => {
    const byId = new Map(QUIZ_CATEGORIES.map((c) => [c.id, c.enabled]));
    expect(byId.get("geography")).toBe(true);
    expect(byId.get("officeholders")).toBe(true);
    expect(byId.get("midterms")).toBe(true);
    expect(byId.get("sports")).toBe(true);
    expect(byId.get("mashups")).toBe(true);
  });
});

describe("getQuizCategory", () => {
  it("returns the matching category for a known, enabled id", () => {
    expect(getQuizCategory("officeholders")?.id).toBe("officeholders");
    expect(getQuizCategory("midterms")?.id).toBe("midterms");
  });

  it("returns the matching category for every id, now that all 5 are enabled", () => {
    for (const id of ["geography", "officeholders", "midterms", "sports", "mashups"]) {
      expect(getQuizCategory(id)?.id).toBe(id);
    }
  });

  it("returns null for an unknown id", () => {
    expect(getQuizCategory("not-a-real-category")).toBeNull();
  });
});
