import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["packages/core/src/**", "apps/api/src/**", "apps/frontend/src/**"],
      exclude: ["**/node_modules/**", "**/test-utils/**", "**/*.test.ts", "**/*.test.tsx"],
    },
  },
});
