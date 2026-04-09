import { describe, it, expect } from "vitest";
import { combineSegments, buildToolCallMarker, remarkToolCalls } from "./remark-tool-calls";
import { appendToken, appendToolCallStart, updateToolCall } from "../../lib/chat-types";
import type { ContentSegment, ToolCallInfo } from "../../lib/chat-types";

const tc = (id: string, name = "read_file"): ToolCallInfo => ({
  id,
  name,
  args: "{}",
  status: "completed",
});

const text = (content: string): ContentSegment => ({ type: "text", content });
const tool = (id: string, name = "read_file"): ContentSegment => ({
  type: "tool_call",
  toolCall: tc(id, name),
});

describe("buildToolCallMarker", () => {
  it("wraps id in marker delimiters with blank-line padding", () => {
    const marker = buildToolCallMarker("tc1");
    expect(marker).toBe("\n\nTOOL_CALL_PLACEHOLDER_[tc1]\n\n");
  });
});

describe("combineSegments", () => {
  it("returns empty markdown for no segments", () => {
    const { markdown, toolCallMap } = combineSegments([]);
    expect(markdown).toBe("");
    expect(toolCallMap.size).toBe(0);
  });

  it("passes through plain text segments unchanged", () => {
    const { markdown, toolCallMap } = combineSegments([
      text("Hello "),
      text("world"),
    ]);
    expect(markdown).toBe("Hello world");
    expect(toolCallMap.size).toBe(0);
  });

  it("inserts markers between text and tool calls at natural boundaries", () => {
    const { markdown, toolCallMap } = combineSegments([
      text("Before tool call."),
      tool("tc1"),
      text("After tool call."),
    ]);
    expect(markdown).toContain("Before tool call.");
    expect(markdown).toContain("TOOL_CALL_PLACEHOLDER_[tc1]");
    expect(markdown).toContain("After tool call.");
    expect(toolCallMap.has("tc1")).toBe(true);

    const parts = markdown.split("TOOL_CALL_PLACEHOLDER_[tc1]");
    expect(parts[0].trimEnd()).toBe("Before tool call.");
    expect(parts[1].trimStart()).toBe("After tool call.");
  });

  it("handles multiple tool calls between text", () => {
    const { markdown, toolCallMap } = combineSegments([
      text("A"),
      tool("t1"),
      text("B"),
      tool("t2"),
      text("C"),
    ]);
    expect(toolCallMap.size).toBe(2);
    const idx1 = markdown.indexOf("TOOL_CALL_PLACEHOLDER_[t1]");
    const idx2 = markdown.indexOf("TOOL_CALL_PLACEHOLDER_[t2]");
    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(idx1);
  });

  it("handles tool-call-only segments", () => {
    const { markdown, toolCallMap } = combineSegments([tool("t1"), tool("t2")]);
    expect(toolCallMap.size).toBe(2);
    expect(markdown).toContain("TOOL_CALL_PLACEHOLDER_[t1]");
    expect(markdown).toContain("TOOL_CALL_PLACEHOLDER_[t2]");
  });

  // --- Table-aware deferral ---

  it("defers tool call when preceding text ends with a table row", () => {
    const { markdown } = combineSegments([
      text("| H1 | H2 |\n|---|---|\n| d1 | d2 |"),
      tool("tc1"),
      text("\n| d3 | d4 |\n\nDone."),
    ]);

    // The table should be intact (both data rows together)
    expect(markdown).toContain("| d1 | d2 |\n| d3 | d4 |");
    // Marker appears after the table, not between rows
    const markerIdx = markdown.indexOf("TOOL_CALL_PLACEHOLDER_[tc1]");
    const doneIdx = markdown.indexOf("Done.");
    expect(markerIdx).toBeGreaterThan(markdown.indexOf("| d3 | d4 |"));
    expect(doneIdx).toBeGreaterThan(-1);
  });

  it("does not defer when tool call is between separate tables", () => {
    const { markdown } = combineSegments([
      text("| A |\n|---|\n| 1 |"),
      tool("tc1"),
      text("\n\n| B |\n|---|\n| 2 |"),
    ]);

    // Blank line before second table means new block — marker should appear between
    const markerIdx = markdown.indexOf("TOOL_CALL_PLACEHOLDER_[tc1]");
    const secondTableIdx = markdown.indexOf("| B |");
    expect(markerIdx).toBeLessThan(secondTableIdx);
  });

  it("defers multiple tool calls mid-table", () => {
    const { markdown } = combineSegments([
      text("| H |\n|---|\n| r1 |"),
      tool("t1"),
      tool("t2"),
      text("\n| r2 |"),
    ]);

    expect(markdown).toContain("| r1 |\n| r2 |");
    const t1Idx = markdown.indexOf("TOOL_CALL_PLACEHOLDER_[t1]");
    const t2Idx = markdown.indexOf("TOOL_CALL_PLACEHOLDER_[t2]");
    expect(t1Idx).toBeGreaterThan(markdown.indexOf("| r2 |"));
    expect(t2Idx).toBeGreaterThan(t1Idx);
  });

  // --- Code fence awareness ---

  it("defers tool call inside an open code fence", () => {
    const { markdown } = combineSegments([
      text("```sql\nSELECT"),
      tool("tc1"),
      text(" * FROM t\n```"),
    ]);

    // Code block should be intact
    expect(markdown).toContain("```sql\nSELECT * FROM t\n```");
    const markerIdx = markdown.indexOf("TOOL_CALL_PLACEHOLDER_[tc1]");
    expect(markerIdx).toBeGreaterThan(markdown.indexOf("```", 3));
  });

  it("does not defer when code fence is closed", () => {
    const { markdown } = combineSegments([
      text("```sql\nSELECT 1\n```\n\nDone."),
      tool("tc1"),
      text("Next."),
    ]);

    const markerIdx = markdown.indexOf("TOOL_CALL_PLACEHOLDER_[tc1]");
    const doneIdx = markdown.indexOf("Done.");
    const nextIdx = markdown.indexOf("Next.");
    expect(markerIdx).toBeGreaterThan(doneIdx);
    expect(markerIdx).toBeLessThan(nextIdx);
  });

  it("defers tool call inside a tilde code fence", () => {
    const { markdown } = combineSegments([
      text("~~~\ncode"),
      tool("tc1"),
      text("\nmore\n~~~"),
    ]);
    expect(markdown).toContain("~~~\ncode\nmore\n~~~");
    expect(markdown.indexOf("TOOL_CALL_PLACEHOLDER_[tc1]")).toBeGreaterThan(
      markdown.lastIndexOf("~~~"),
    );
  });

  // --- Edge cases ---

  it("handles tool call at the very beginning (no preceding text)", () => {
    const { markdown, toolCallMap } = combineSegments([
      tool("tc1"),
      text("After."),
    ]);
    expect(markdown).toContain("TOOL_CALL_PLACEHOLDER_[tc1]");
    expect(markdown).toContain("After.");
    expect(toolCallMap.size).toBe(1);
  });

  it("handles tool call at the very end (no following text)", () => {
    const { markdown, toolCallMap } = combineSegments([
      text("Before."),
      tool("tc1"),
    ]);
    expect(markdown).toContain("Before.");
    expect(markdown).toContain("TOOL_CALL_PLACEHOLDER_[tc1]");
    expect(toolCallMap.size).toBe(1);
  });

  it("populates toolCallMap for deferred tool calls", () => {
    const { toolCallMap } = combineSegments([
      text("| H |\n|---|\n| r1 |"),
      tool("deferred1"),
      text("\n| r2 |"),
    ]);
    expect(toolCallMap.has("deferred1")).toBe(true);
    expect(toolCallMap.get("deferred1")!.name).toBe("read_file");
  });

  it("handles whitespace-only text segment between tool calls", () => {
    const { markdown, toolCallMap } = combineSegments([
      text("A"),
      tool("t1"),
      text("  \n  "),
      tool("t2"),
      text("B"),
    ]);
    expect(toolCallMap.size).toBe(2);
    expect(markdown).toContain("TOOL_CALL_PLACEHOLDER_[t1]");
    expect(markdown).toContain("TOOL_CALL_PLACEHOLDER_[t2]");
  });

  it("table separator row (|---|) counts as table context", () => {
    const { markdown } = combineSegments([
      text("| H1 | H2 |\n|---|---|"),
      tool("tc1"),
      text("\n| d1 | d2 |"),
    ]);
    expect(markdown).toContain("|---|---|\n| d1 | d2 |");
  });
});

describe("remarkToolCalls plugin", () => {
  it("replaces a marker paragraph with a toolCallNode", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "TOOL_CALL_PLACEHOLDER_[tc1]" }],
        },
      ],
    };

    const plugin = remarkToolCalls();
    plugin(tree as any);

    expect(tree.children[0].type).toBe("toolCallNode");
    expect((tree.children[0] as any).data.hProperties["data-tool-id"]).toBe("tc1");
  });

  it("does not replace non-marker paragraphs", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "Hello world" }],
        },
      ],
    };

    const plugin = remarkToolCalls();
    plugin(tree as any);

    expect(tree.children[0].type).toBe("paragraph");
  });

  it("does not replace paragraphs with multiple children", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "TOOL_CALL_PLACEHOLDER_[tc1]" },
            { type: "text", value: " extra" },
          ],
        },
      ],
    };

    const plugin = remarkToolCalls();
    plugin(tree as any);

    expect(tree.children[0].type).toBe("paragraph");
  });

  it("handles multiple markers in a tree", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "intro" }],
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "TOOL_CALL_PLACEHOLDER_[t1]" }],
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "middle" }],
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "TOOL_CALL_PLACEHOLDER_[t2]" }],
        },
      ],
    };

    const plugin = remarkToolCalls();
    plugin(tree as any);

    expect(tree.children[0].type).toBe("paragraph");
    expect(tree.children[1].type).toBe("toolCallNode");
    expect(tree.children[2].type).toBe("paragraph");
    expect(tree.children[3].type).toBe("toolCallNode");
    expect((tree.children[1] as any).data.hProperties["data-tool-id"]).toBe("t1");
    expect((tree.children[3] as any).data.hProperties["data-tool-id"]).toBe("t2");
  });

  it("handles markers nested inside blockquote children", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: "TOOL_CALL_PLACEHOLDER_[nested1]" }],
            },
          ],
        },
      ],
    };

    const plugin = remarkToolCalls();
    plugin(tree as any);

    expect((tree.children[0] as any).children[0].type).toBe("toolCallNode");
  });
});

describe("end-to-end: SSE stream → segments → combineSegments", () => {
  it("keeps a table intact when a tool call interrupts mid-table during streaming", () => {
    let segments: ContentSegment[] = [];

    // Agent streams table header and first row
    segments = appendToken(segments, "Here are the fields:\n\n");
    segments = appendToken(segments, "| # | Field | Type |\n");
    segments = appendToken(segments, "|---|---|---|\n");
    segments = appendToken(segments, "| 1 | id | BIGINT |");

    // Agent decides to read a file mid-table
    segments = appendToolCallStart(segments, {
      id: "tc1",
      name: "read_file",
      args: '{"path":"order_risks.yaml"}',
      status: "running",
    });
    segments = updateToolCall(segments, "tc1", {
      status: "completed",
      result: "file content",
    });

    // Agent continues the table with data from the file
    segments = appendToken(segments, "\n| 2 | product_id | BIGINT |");
    segments = appendToken(segments, "\n| 3 | risk_score | DECIMAL |");
    segments = appendToken(segments, "\n\nThe table has 3 fields.");

    // Verify segment structure matches expected SSE flow
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.type)).toEqual(["text", "tool_call", "text"]);

    // Combine for rendering
    const { markdown, toolCallMap } = combineSegments(segments);

    // Table must be complete and contiguous
    expect(markdown).toContain(
      "| 1 | id | BIGINT |\n| 2 | product_id | BIGINT |\n| 3 | risk_score | DECIMAL |",
    );

    // Tool call marker must appear AFTER the table, not between rows
    const markerIdx = markdown.indexOf("TOOL_CALL_PLACEHOLDER_[tc1]");
    const lastRowIdx = markdown.indexOf("| 3 | risk_score | DECIMAL |");
    expect(markerIdx).toBeGreaterThan(lastRowIdx);

    // toolCallMap is populated
    expect(toolCallMap.has("tc1")).toBe(true);
    expect(toolCallMap.get("tc1")!.status).toBe("completed");
  });

  it("places tool call between tables when agent finishes one table and starts another", () => {
    let segments: ContentSegment[] = [];

    segments = appendToken(segments, "| A |\n|---|\n| 1 |");
    segments = appendToolCallStart(segments, {
      id: "tc1",
      name: "read_file",
      args: "{}",
      status: "running",
    });
    segments = updateToolCall(segments, "tc1", { status: "completed", result: "ok" });
    segments = appendToken(segments, "\n\nSecond table:\n\n| B |\n|---|\n| 2 |");

    const { markdown } = combineSegments(segments);

    // First table complete
    expect(markdown).toContain("| A |\n|---|\n| 1 |");
    // Tool call between tables (blank line signals new block)
    const markerIdx = markdown.indexOf("TOOL_CALL_PLACEHOLDER_[tc1]");
    const secondTableIdx = markdown.indexOf("Second table:");
    expect(markerIdx).toBeLessThan(secondTableIdx);
  });
});
