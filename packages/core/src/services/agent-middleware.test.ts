import { describe, it, expect } from "vitest";
import { ToolMessage } from "@langchain/core/messages";
import { ToolInvocationError, MiddlewareError } from "langchain";
import {
  createToolErrorRecoveryMiddleware,
  isRecoverableToolInputError,
  describeToolInputError,
} from "./agent-middleware";

// Mirrors the inner error LangChain raises when a model's tool arguments fail
// the tool's Zod schema (e.g. `write_file` called with `{}`).
function makeSchemaParseError(): Error {
  const err = new Error(
    "Received tool input did not match expected schema\n" +
      "✖ Invalid input: expected string, received undefined\n  → at file_path",
  );
  err.name = "ToolInputParsingException";
  return err;
}

function makeToolInvocationError(args: Record<string, unknown> = {}): ToolInvocationError {
  return new ToolInvocationError(makeSchemaParseError(), {
    name: "write_file",
    args,
    id: "tooluse_123",
    type: "tool_call",
  });
}

describe("isRecoverableToolInputError", () => {
  it("matches a raw ToolInvocationError", () => {
    expect(isRecoverableToolInputError(makeToolInvocationError())).toBe(true);
  });

  it("matches a ToolInvocationError wrapped in a MiddlewareError", () => {
    const wrapped = MiddlewareError.wrap(makeToolInvocationError(), "FilesystemMiddleware");
    expect(isRecoverableToolInputError(wrapped)).toBe(true);
  });

  it("matches the bare schema-validation exception by name", () => {
    expect(isRecoverableToolInputError(makeSchemaParseError())).toBe(true);
  });

  it("matches when only the message text is available (name lost)", () => {
    expect(
      isRecoverableToolInputError(
        new Error("Received tool input did not match expected schema"),
      ),
    ).toBe(true);
  });

  it("does NOT match unrelated execution / infrastructure errors", () => {
    expect(isRecoverableToolInputError(new Error("Query execution failed."))).toBe(false);
    expect(isRecoverableToolInputError(new Error("ECONNREFUSED"))).toBe(false);
    expect(isRecoverableToolInputError("boom")).toBe(false);
    expect(isRecoverableToolInputError(undefined)).toBe(false);
  });
});

describe("describeToolInputError", () => {
  it("extracts the inner tool error message", () => {
    const detail = describeToolInputError(makeToolInvocationError());
    expect(detail).toMatch(/expected string, received undefined/);
    expect(detail).toMatch(/file_path/);
  });

  it("unwraps through a MiddlewareError to the inner detail", () => {
    const wrapped = MiddlewareError.wrap(makeToolInvocationError(), "FilesystemMiddleware");
    expect(describeToolInputError(wrapped)).toMatch(/expected string, received undefined/);
  });

  it("falls back to the top-level message when no inner tool error exists", () => {
    expect(describeToolInputError(new Error("plain message"))).toBe("plain message");
  });
});

describe("createToolErrorRecoveryMiddleware", () => {
  const mw = createToolErrorRecoveryMiddleware();

  const makeRequest = (args: Record<string, unknown> = {}) => ({
    toolCall: { name: "write_file", args, id: "tooluse_123", type: "tool_call" as const },
  });

  it("converts a ToolInvocationError into a recoverable error ToolMessage", async () => {
    const result = await mw.wrapToolCall!(makeRequest() as never, async () => {
      throw makeToolInvocationError();
    });

    expect(ToolMessage.isInstance(result)).toBe(true);
    const msg = result as ToolMessage;
    expect(msg.status).toBe("error");
    expect(msg.name).toBe("write_file");
    expect(msg.tool_call_id).toBe("tooluse_123");
    expect(msg.content).toMatch(/invalid arguments and was NOT executed/);
    expect(msg.content).toMatch(/file_path/);
    expect(msg.content).toMatch(/Re-issue the call/);
  });

  it("recovers even when the error arrives wrapped as a MiddlewareError", async () => {
    const result = await mw.wrapToolCall!(makeRequest() as never, async () => {
      throw MiddlewareError.wrap(makeToolInvocationError(), "FilesystemMiddleware");
    });
    expect(ToolMessage.isInstance(result)).toBe(true);
    expect((result as ToolMessage).status).toBe("error");
  });

  it("re-throws non-recoverable errors unchanged", async () => {
    const boom = new Error("Postgres connection refused");
    await expect(
      mw.wrapToolCall!(makeRequest() as never, async () => {
        throw boom;
      }),
    ).rejects.toThrow("Postgres connection refused");
  });

  it("passes a successful tool result straight through", async () => {
    const success = new ToolMessage({
      content: "ok",
      tool_call_id: "tooluse_123",
      name: "write_file",
    });
    const result = await mw.wrapToolCall!(makeRequest() as never, async () => success);
    expect(result).toBe(success);
  });
});
