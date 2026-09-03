import { describe, it, expect } from "vitest";
import { QUIZ_CATEGORIES, getQuizCategory } from "./category-config";

describe("QUIZ_CATEGORIES", () => {
  it("has exactly 5 categories", () => {
    expect(QUIZ_CATEGORIES).toHaveLength(5);
  });

  it("has geography enabled and every other category disabled", () => {
    const geography = QUIZ_CATEGORIES.find((c) => c.id === "geography");
    expect(geography?.enabled).toBe(true);
    const others = QUIZ_CATEGORIES.filter((c) => c.id !== "geography");
    expect(others.every((c) => c.enabled === false)).toBe(true);
  });
});

describe("getQuizCategory", () => {
  it("returns the matching category for a known, enabled id", () => {
    expect(getQuizCategory("geography")?.id).toBe("geography");
  });

  it("returns null for a known but disabled id", () => {
    expect(getQuizCategory("sports")).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(getQuizCategory("not-a-real-category")).toBeNull();
  });
});
