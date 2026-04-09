import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          root: "packages/core",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "api",
          root: "apps/api",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "frontend",
          root: "apps/frontend",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        },
      },
      {
        test: {
          name: "worker",
          root: "apps/worker",
          include: ["src/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["packages/core/src/**", "apps/api/src/**", "apps/frontend/src/**"],
      exclude: ["**/node_modules/**", "**/test-utils/**", "**/*.test.ts", "**/*.test.tsx"],
    },
  },
});
