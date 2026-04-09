import type { ContentSegment, ToolCallInfo } from "../../lib/chat-types";

const TOOL_MARKER_RE = /^TOOL_CALL_PLACEHOLDER_\[(.+)\]$/;
const TABLE_ROW_RE = /^\|.*\|$/;
const FENCE_RE = /^(`{3,}|~{3,})/;

export function buildToolCallMarker(id: string): string {
  return `\n\nTOOL_CALL_PLACEHOLDER_[${id}]\n\n`;
}

function endsWithTableRow(text: string): boolean {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === "") continue;
    return TABLE_ROW_RE.test(trimmed);
  }
  return false;
}

/**
 * A new text chunk continues the preceding table only when it starts with
 * a pipe-delimited row WITHOUT a blank-line gap (blank line = new block).
 */
function continuesTableRow(text: string): boolean {
  if (/^\n\s*\n/.test(text)) return false;
  const firstLine = text.replace(/^\n/, "").split("\n")[0]?.trim();
  return firstLine ? TABLE_ROW_RE.test(firstLine) : false;
}

function isInsideCodeFence(text: string): boolean {
  let count = 0;
  for (const line of text.split("\n")) {
    if (FENCE_RE.test(line.trim())) count++;
  }
  return count % 2 === 1;
}

/**
 * Combine segments into a single markdown string with tool-call placeholders.
 *
 * Tool calls that appear mid-table or mid-code-fence are deferred past the
 * block boundary so the markdown parser sees a complete structure.
 */
export function combineSegments(segments: ContentSegment[]): {
  markdown: string;
  toolCallMap: Map<string, ToolCallInfo>;
} {
  const toolCallMap = new Map<string, ToolCallInfo>();
  const deferred: ToolCallInfo[] = [];
  let md = "";

  function flushDeferred() {
    for (const tc of deferred.splice(0)) md += buildToolCallMarker(tc.id);
  }

  function isInsideBlock() {
    return endsWithTableRow(md) || isInsideCodeFence(md);
  }

  for (const seg of segments) {
    if (seg.type === "tool_call") {
      toolCallMap.set(seg.toolCall.id, seg.toolCall);

      if (isInsideBlock()) {
        deferred.push(seg.toolCall);
      } else {
        flushDeferred();
        md += buildToolCallMarker(seg.toolCall.id);
      }
    } else {
      if (deferred.length > 0) {
        const keepDeferred =
          (endsWithTableRow(md) && continuesTableRow(seg.content)) ||
          isInsideCodeFence(md);
        if (!keepDeferred) flushDeferred();
      }
      md += seg.content;
    }
  }

  flushDeferred();
  return { markdown: md, toolCallMap };
}

/* ------------------------------------------------------------------ */
/*  Remark plugin — converts placeholder paragraphs into custom nodes */
/* ------------------------------------------------------------------ */

function visitParagraphs(
  node: any,
  fn: (node: any, index: number, parent: any) => void,
) {
  if (!node.children) return;
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    if (child.type === "paragraph") fn(child, i, node);
    visitParagraphs(child, fn);
  }
}

/**
 * Remark plugin: replaces placeholder paragraphs with `<div data-tool-id>`
 * hast nodes that MarkdownContent maps to ToolCallCard components.
 */
export function remarkToolCalls() {
  return (tree: any) => {
    visitParagraphs(tree, (node, index, parent) => {
      if (node.children?.length !== 1 || node.children[0].type !== "text")
        return;
      const match = TOOL_MARKER_RE.exec(node.children[0].value.trim());
      if (!match) return;

      parent.children[index] = {
        type: "toolCallNode",
        data: {
          hName: "div",
          hProperties: { "data-tool-id": match[1] },
        },
        children: [],
      };
    });
  };
}
