import { describe, it, expect } from "vitest";
import { assertSafeSegment } from "./semantic-model-files";

describe("assertSafeSegment", () => {
  it("accepts valid MongoDB ObjectId hex strings", () => {
    expect(() => assertSafeSegment("507f1f77bcf86cd799439011", "projectId")).not.toThrow();
  });

  it("accepts alphanumeric names", () => {
    expect(() => assertSafeSegment("my-project", "projectId")).not.toThrow();
    expect(() => assertSafeSegment("model_v2", "name")).not.toThrow();
    expect(() => assertSafeSegment("dataset.v1", "name")).not.toThrow();
  });

  it("accepts names starting with a digit", () => {
    expect(() => assertSafeSegment("123abc", "name")).not.toThrow();
  });

  it("rejects path traversal with ..", () => {
    expect(() => assertSafeSegment("..", "projectId")).toThrow(/Invalid projectId/);
    expect(() => assertSafeSegment("../etc", "projectId")).toThrow(/Invalid projectId/);
    expect(() => assertSafeSegment("foo/../bar", "name")).toThrow(/Invalid name/);
  });

  it("rejects absolute paths", () => {
    expect(() => assertSafeSegment("/etc/passwd", "projectId")).toThrow(/Invalid projectId/);
  });

  it("rejects empty strings", () => {
    expect(() => assertSafeSegment("", "projectId")).toThrow(/Invalid projectId/);
  });

  it("rejects strings starting with a dot", () => {
    expect(() => assertSafeSegment(".hidden", "name")).toThrow(/Invalid name/);
  });

  it("rejects strings starting with a dash", () => {
    expect(() => assertSafeSegment("-flag", "name")).toThrow(/Invalid name/);
  });

  it("rejects strings with slashes", () => {
    expect(() => assertSafeSegment("a/b", "name")).toThrow(/Invalid name/);
    expect(() => assertSafeSegment("a\\b", "name")).toThrow(/Invalid name/);
  });

  it("rejects strings with spaces or special characters", () => {
    expect(() => assertSafeSegment("hello world", "name")).toThrow(/Invalid name/);
    expect(() => assertSafeSegment("name;rm -rf", "name")).toThrow(/Invalid name/);
    expect(() => assertSafeSegment("$HOME", "name")).toThrow(/Invalid name/);
  });
});
