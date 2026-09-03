import { defineConfig } from "vitest/config";

// Scoped to src/lib/quiz/* pure-function tests only (see CLAUDE.md/the quiz design spec for why
// hooks/components/Supabase-touching code aren't unit-tested) — "node" environment is enough,
// no DOM/jsdom needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
