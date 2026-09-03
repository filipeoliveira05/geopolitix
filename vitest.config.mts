import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Scoped to src/lib/quiz/* pure-function tests only (see CLAUDE.md/the quiz design spec for why
// hooks/components/Supabase-touching code aren't unit-tested) — "node" environment is enough,
// no DOM/jsdom needed.
export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*" -> "./src/*" path mapping — Vite (which Vitest runs on) does
    // NOT read tsconfig `paths` on its own, so this needs its own explicit alias. Caught live:
    // every prior quiz test only ever imported from "@/lib/*" as a type-only import (erased
    // before bundling, so it never actually needed resolving), and the first real (value) import
    // from that alias failed with "Cannot find package '@/lib/states'".
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
