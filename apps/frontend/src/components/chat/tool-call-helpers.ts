import type { ToolCallInfo } from "../../lib/chat-types";

export function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Parse tool call args, handling deepagents' `{input: <args>}` wrapping
 * and double-encoded strings like `{input: '{"sql":"..."}'}`.
 */
export function getArgs(tc: ToolCallInfo): Record<string, unknown> {
  const parsed = safeParse(tc.args) as Record<string, unknown> | null;
  if (!parsed) return {};

  if ("input" in parsed && Object.keys(parsed).length === 1) {
    const inner = parsed.input;
    if (typeof inner === "string") {
      const innerParsed = safeParse(inner);
      if (
        innerParsed &&
        typeof innerParsed === "object" &&
        !Array.isArray(innerParsed)
      ) {
        return innerParsed as Record<string, unknown>;
      }
      return { input: inner };
    }
    if (typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
  }

  return parsed;
}

export function fileBasename(tc: ToolCallInfo): string {
  const args = getArgs(tc);
  const file =
    (args?.file_path as string) || (args?.path as string) || "file";
  return file.split("/").pop() || file;
}
