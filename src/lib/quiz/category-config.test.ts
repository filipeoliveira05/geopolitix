import { describe, it, expect } from "vitest";
import { QUIZ_CATEGORIES, getQuizCategory } from "./category-config";

describe("QUIZ_CATEGORIES", () => {
  it("has exactly 5 categories", () => {
    expect(QUIZ_CATEGORIES).toHaveLength(5);
  });

  it("has geography, officeholders, and midterms enabled; sports and mashups still disabled", () => {
    const byId = new Map(QUIZ_CATEGORIES.map((c) => [c.id, c.enabled]));
    expect(byId.get("geography")).toBe(true);
    expect(byId.get("officeholders")).toBe(true);
    expect(byId.get("midterms")).toBe(true);
    expect(byId.get("sports")).toBe(false);
    expect(byId.get("mashups")).toBe(false);
  });
});

describe("getQuizCategory", () => {
  it("returns the matching category for a known, enabled id", () => {
    expect(getQuizCategory("officeholders")?.id).toBe("officeholders");
    expect(getQuizCategory("midterms")?.id).toBe("midterms");
  });

  it("returns null for a known but disabled id", () => {
    expect(getQuizCategory("sports")).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(getQuizCategory("not-a-real-category")).toBeNull();
  });
});
