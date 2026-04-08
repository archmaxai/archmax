import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
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
]);
