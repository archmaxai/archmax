import { describe, it, expect } from "vitest";
import { safeParse, getArgs, fileBasename } from "./tool-call-helpers";
import type { ToolCallInfo } from "../../lib/chat-types";

function tc(args: string, name = "tool"): ToolCallInfo {
  return { id: "1", name, args, status: "completed" };
}

describe("safeParse", () => {
  it("returns parsed object for valid JSON", () => {
    expect(safeParse('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns null for invalid JSON", () => {
    expect(safeParse("not json")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(safeParse("")).toBeNull();
  });
});

describe("getArgs", () => {
  it("unwraps double-encoded {input: string} from deepagents", () => {
    const result = getArgs(tc('{"input":"{\\"sql\\":\\"SELECT 1\\"}"}'));
    expect(result).toEqual({ sql: "SELECT 1" });
  });

  it("unwraps {input: object} wrapping", () => {
    const result = getArgs(tc('{"input":{"sql":"SELECT 1"}}'));
    expect(result).toEqual({ sql: "SELECT 1" });
  });

  it("returns {input: string} when inner string is not valid JSON object", () => {
    const result = getArgs(tc('{"input":"plain text"}'));
    expect(result).toEqual({ input: "plain text" });
  });

  it("returns full object when not wrapped in input", () => {
    const result = getArgs(tc('{"sql":"SELECT 1","limit":10}'));
    expect(result).toEqual({ sql: "SELECT 1", limit: 10 });
  });

  it("returns empty object for non-parseable args", () => {
    const result = getArgs(tc("broken json"));
    expect(result).toEqual({});
  });

  it("does not unwrap input when other keys are present", () => {
    const result = getArgs(tc('{"input":"inner","extra":"key"}'));
    expect(result).toEqual({ input: "inner", extra: "key" });
  });

  it("does not unwrap input when value is an array", () => {
    const result = getArgs(tc('{"input":[1,2,3]}'));
    expect(result).toEqual({ input: [1, 2, 3] });
  });
});

describe("fileBasename", () => {
  it("extracts basename from file_path arg", () => {
    const result = fileBasename(tc('{"input":{"file_path":"/models/sales.yaml"}}'));
    expect(result).toBe("sales.yaml");
  });

  it("extracts basename from path arg", () => {
    const result = fileBasename(tc('{"path":"src/deep/file.ts"}'));
    expect(result).toBe("file.ts");
  });

  it("returns 'file' when no path args present", () => {
    const result = fileBasename(tc('{"sql":"SELECT 1"}'));
    expect(result).toBe("file");
  });

  it("handles bare filename without slashes", () => {
    const result = fileBasename(tc('{"file_path":"readme.md"}'));
    expect(result).toBe("readme.md");
  });
});
