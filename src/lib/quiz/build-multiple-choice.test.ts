import { describe, it, expect } from "vitest";
import { buildMultipleChoiceQuestion } from "./build-multiple-choice";

type Item = { id: string; label: string };

const pool: Item[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
  { id: "d", label: "Delta" },
  { id: "e", label: "Epsilon" },
];

describe("buildMultipleChoiceQuestion", () => {
  it("has the correct answer among the 4 options", () => {
    const q = buildMultipleChoiceQuestion(pool[0], pool, {
      getPrompt: () => "Which one is Alpha?",
      getOptionText: (item) => item.label,
    });
    expect(q.options).toHaveLength(4);
    expect(q.options[q.correctIndex]).toBe("Alpha");
  });

  it("never includes a distractor equal to the correct answer's text", () => {
    const q = buildMultipleChoiceQuestion(pool[0], pool, {
      getPrompt: () => "prompt",
      getOptionText: (item) => item.label,
    });
    const distractors = q.options.filter((_, i) => i !== q.correctIndex);
    expect(distractors).not.toContain("Alpha");
  });

  it("has no duplicate option text", () => {
    const q = buildMultipleChoiceQuestion(pool[0], pool, {
      getPrompt: () => "prompt",
      getOptionText: (item) => item.label,
    });
    expect(new Set(q.options).size).toBe(4);
  });

  it("sets the prompt from getPrompt(subject)", () => {
    const q = buildMultipleChoiceQuestion(pool[1], pool, {
      getPrompt: (item) => `Guess: ${item.label}`,
      getOptionText: (item) => item.label,
    });
    expect(q.prompt).toBe("Guess: Beta");
  });

  it("sets imageUrl from getImageUrl when provided", () => {
    const q = buildMultipleChoiceQuestion(pool[0], pool, {
      getPrompt: () => "prompt",
      getOptionText: (item) => item.label,
      getImageUrl: () => "https://example.com/x.png",
    });
    expect(q.imageUrl).toBe("https://example.com/x.png");
  });

  it("defaults imageUrl to null when getImageUrl is not provided", () => {
    const q = buildMultipleChoiceQuestion(pool[0], pool, {
      getPrompt: () => "prompt",
      getOptionText: (item) => item.label,
    });
    expect(q.imageUrl).toBeNull();
  });

  it("sets imageCaption/imageCaptionParty from getImageCaption/getImageCaptionParty when provided", () => {
    const q = buildMultipleChoiceQuestion(pool[0], pool, {
      getPrompt: () => "prompt",
      getOptionText: (item) => item.label,
      getImageCaption: (item) => item.label,
      getImageCaptionParty: () => "Democrat",
    });
    expect(q.imageCaption).toBe("Alpha");
    expect(q.imageCaptionParty).toBe("Democrat");
  });

  it("defaults imageCaption to null and imageCaptionParty to undefined when not provided", () => {
    const q = buildMultipleChoiceQuestion(pool[0], pool, {
      getPrompt: () => "prompt",
      getOptionText: (item) => item.label,
    });
    expect(q.imageCaption).toBeNull();
    expect(q.imageCaptionParty).toBeUndefined();
  });

  it("sets revealImageUrl/revealCaption from getRevealImageUrl/getRevealCaption when provided", () => {
    const q = buildMultipleChoiceQuestion(pool[0], pool, {
      getPrompt: () => "prompt",
      getOptionText: (item) => item.label,
      getRevealImageUrl: () => "https://example.com/reveal.png",
      getRevealCaption: (item) => item.label,
    });
    expect(q.revealImageUrl).toBe("https://example.com/reveal.png");
    expect(q.revealCaption).toBe("Alpha");
  });

  it("defaults revealImageUrl/revealCaption to null when not provided", () => {
    const q = buildMultipleChoiceQuestion(pool[0], pool, {
      getPrompt: () => "prompt",
      getOptionText: (item) => item.label,
    });
    expect(q.revealImageUrl).toBeNull();
    expect(q.revealCaption).toBeNull();
  });

  it("throws when the pool has fewer than 4 distinct option texts", () => {
    const smallPool: Item[] = [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ];
    expect(() =>
      buildMultipleChoiceQuestion(smallPool[0], smallPool, {
        getPrompt: () => "prompt",
        getOptionText: (item) => item.label,
      }),
    ).toThrow();
  });

  it("dedupes distractor pool by option text, not by object identity", () => {
    // Two different rows that happen to render the same option text should count as one
    // possible distractor, not two — otherwise a duplicate-text option could slip through.
    const poolWithDuplicateText: Item[] = [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Beta" }, // same text as "b", different row
      { id: "d", label: "Gamma" },
      { id: "e", label: "Delta" },
    ];
    const q = buildMultipleChoiceQuestion(poolWithDuplicateText[0], poolWithDuplicateText, {
      getPrompt: () => "prompt",
      getOptionText: (item) => item.label,
    });
    expect(new Set(q.options).size).toBe(4);
  });

  it("supports a smaller option count via optionCount", () => {
    const smallPool: Item[] = [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ];
    const q = buildMultipleChoiceQuestion(smallPool[0], smallPool, {
      getPrompt: () => "prompt",
      getOptionText: (item) => item.label,
      optionCount: 2,
    });
    expect(q.options).toHaveLength(2);
    expect(q.options[q.correctIndex]).toBe("Alpha");
  });

  it("still throws when the pool has fewer distinct texts than the requested optionCount", () => {
    const onlyOne: Item[] = [{ id: "a", label: "Alpha" }];
    expect(() =>
      buildMultipleChoiceQuestion(onlyOne[0], onlyOne, {
        getPrompt: () => "prompt",
        getOptionText: (item) => item.label,
        optionCount: 2,
      }),
    ).toThrow();
  });
});
