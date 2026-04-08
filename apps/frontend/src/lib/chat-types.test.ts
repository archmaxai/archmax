import { describe, it, expect } from "vitest";
import { toSegments, getTextContent } from "./chat-types";
import type { ToolCallInfo, ContentSegment } from "./chat-types";

describe("toSegments", () => {
  it("converts plain text content to a single text segment", () => {
    const segments = toSegments("Hello world");
    expect(segments).toEqual([{ type: "text", content: "Hello world" }]);
  });

  it("returns empty array for empty content and no tool calls", () => {
    const segments = toSegments("");
    expect(segments).toEqual([]);
  });

  it("converts tool calls followed by text content", () => {
    const tc: ToolCallInfo = {
      id: "tc1",
      name: "executeQuery",
      args: '{"sql":"SELECT 1"}',
      status: "completed",
      result: '{"columns":["1"],"rows":[{"1":1}],"rowCount":1}',
    };
    const segments = toSegments("Some text", [tc]);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ type: "tool_call", toolCall: tc });
    expect(segments[1]).toEqual({ type: "text", content: "Some text" });
  });

  it("converts multiple tool calls with no text", () => {
    const tc1: ToolCallInfo = { id: "1", name: "ls", args: "{}", status: "completed" };
    const tc2: ToolCallInfo = { id: "2", name: "read_file", args: "{}", status: "completed" };
    const segments = toSegments("", [tc1, tc2]);
    expect(segments).toHaveLength(2);
    expect(segments[0].type).toBe("tool_call");
    expect(segments[1].type).toBe("tool_call");
  });

  it("handles undefined tool calls", () => {
    const segments = toSegments("text only", undefined);
    expect(segments).toEqual([{ type: "text", content: "text only" }]);
  });

  it("handles empty tool calls array", () => {
    const segments = toSegments("text only", []);
    expect(segments).toEqual([{ type: "text", content: "text only" }]);
  });
});

describe("getTextContent", () => {
  it("extracts text from a single text segment", () => {
    const segments: ContentSegment[] = [{ type: "text", content: "Hello" }];
    expect(getTextContent(segments)).toBe("Hello");
  });

  it("concatenates multiple text segments", () => {
    const segments: ContentSegment[] = [
      { type: "text", content: "Hello " },
      { type: "text", content: "world" },
    ];
    expect(getTextContent(segments)).toBe("Hello world");
  });

  it("skips tool_call segments", () => {
    const segments: ContentSegment[] = [
      { type: "text", content: "Before " },
      { type: "tool_call", toolCall: { id: "1", name: "ls", args: "{}", status: "completed" } },
      { type: "text", content: "after" },
    ];
    expect(getTextContent(segments)).toBe("Before after");
  });

  it("returns empty string for empty segments", () => {
    expect(getTextContent([])).toBe("");
  });

  it("returns empty string for segments with only tool calls", () => {
    const segments: ContentSegment[] = [
      { type: "tool_call", toolCall: { id: "1", name: "ls", args: "{}", status: "completed" } },
    ];
    expect(getTextContent(segments)).toBe("");
  });
});
