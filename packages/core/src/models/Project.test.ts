import { describe, it, expect } from "vitest";
import { slugifyProjectTitle, PROJECT_SLUG_PATTERN } from "./Project";

describe("slugifyProjectTitle", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugifyProjectTitle("My Shopify Store")).toBe("my-shopify-store");
  });

  it("replaces non-alphanumeric characters", () => {
    expect(slugifyProjectTitle("Project (v2)")).toBe("project-v2");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugifyProjectTitle("my - - project")).toBe("my-project");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugifyProjectTitle("--hello--")).toBe("hello");
  });

  it("handles all-special-character input", () => {
    const slug = slugifyProjectTitle("!!!");
    expect(slug.length).toBeGreaterThanOrEqual(2);
  });

  it("pads short slugs to min 2 chars", () => {
    const slug = slugifyProjectTitle("a");
    expect(slug.length).toBeGreaterThanOrEqual(2);
  });

  it("handles unicode characters", () => {
    expect(slugifyProjectTitle("Über Analytics")).toBe("ber-analytics");
  });

  it("preserves numbers", () => {
    expect(slugifyProjectTitle("Project 42")).toBe("project-42");
  });
});

describe("PROJECT_SLUG_PATTERN", () => {
  it("accepts valid slugs", () => {
    expect(PROJECT_SLUG_PATTERN.test("my-project")).toBe(true);
    expect(PROJECT_SLUG_PATTERN.test("analytics-2")).toBe(true);
    expect(PROJECT_SLUG_PATTERN.test("a1")).toBe(true);
  });

  it("rejects invalid slugs", () => {
    expect(PROJECT_SLUG_PATTERN.test("-start")).toBe(false);
    expect(PROJECT_SLUG_PATTERN.test("end-")).toBe(false);
    expect(PROJECT_SLUG_PATTERN.test("a")).toBe(false);
    expect(PROJECT_SLUG_PATTERN.test("has space")).toBe(false);
    expect(PROJECT_SLUG_PATTERN.test("UPPER")).toBe(false);
  });
});
