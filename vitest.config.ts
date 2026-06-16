/**
 * Vitest configuration — Node environment, src-scoped tests, @/* alias.
 *
 * @module vitest.config
 * Data source: none
 * @see CLAUDE.md §10
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
