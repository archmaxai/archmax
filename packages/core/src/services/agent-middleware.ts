import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";

/**
 * Tool input-validation errors that should be reflected back to the model as a
 * recoverable `ToolMessage` rather than aborting the whole agent run.
 *
 * LangChain's `ToolNode` already does this for `ToolInvocationError` (the error
 * raised when a model emits arguments that fail a tool's Zod schema, e.g.
 * `write_file` called with `{}` so the required `file_path` is `undefined`) —
 * but ONLY when no `wrapToolCall` middleware is present. `createDeepAgent`
 * always installs a filesystem middleware whose `wrapToolCall` hook wraps every
 * tool call, which flips these into "middleware errors". `ToolNode#handleError`
 * re-throws middleware errors unless `handleToolErrors === true`, so the
 * malformed tool call kills the entire job instead of letting the model retry.
 *
 * The names below are matched up the `cause` chain because `MiddlewareError`
 * copies the wrapped error's `name`, so the same check works whether the error
 * reaches us raw (we are the innermost `wrapToolCall`) or already wrapped.
 */
const RECOVERABLE_TOOL_ERROR_NAMES = new Set([
  "ToolInvocationError",
  "ToolInputParsingException",
]);

// Fallback message sniff for the (version-dependent) schema-validation text, in
// case the error class name is ever lost across module boundaries.
const SCHEMA_ERROR_MESSAGE_RE =
  /did not match expected schema|received tool input did not match|invalid input:/i;

function walkCauses(err: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

/**
 * Is `err` a model-supplied tool-input error (bad/missing arguments) that the
 * agent can recover from by re-issuing the call? Genuine tool *execution*
 * failures and infrastructure errors are deliberately NOT matched so they keep
 * propagating.
 */
export function isRecoverableToolInputError(err: unknown): boolean {
  for (const link of walkCauses(err)) {
    const name = (link as { name?: unknown }).name;
    if (typeof name === "string" && RECOVERABLE_TOOL_ERROR_NAMES.has(name)) {
      return true;
    }
    const message = (link as { message?: unknown }).message;
    if (typeof message === "string" && SCHEMA_ERROR_MESSAGE_RE.test(message)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract the most specific validation message from the error chain so the
 * feedback the model receives points at the offending field (e.g.
 * `expected string, received undefined → at file_path`).
 */
export function describeToolInputError(err: unknown): string {
  for (const link of walkCauses(err)) {
    const toolError = (link as { toolError?: { message?: unknown } }).toolError;
    if (toolError && typeof toolError.message === "string" && toolError.message) {
      return toolError.message;
    }
  }
  const top = err instanceof Error ? err.message : String(err);
  return top || "The tool arguments were invalid.";
}

/**
 * Middleware that converts recoverable tool input-validation errors into a
 * `ToolMessage` so the agent can self-correct instead of the run failing.
 *
 * It MUST be registered last in `createDeepAgent({ middleware })` so it becomes
 * the innermost `wrapToolCall` layer and catches the raw validation error
 * before any outer middleware re-wraps it. Non-recoverable errors are
 * re-thrown unchanged so existing failure handling is preserved.
 */
export function createToolErrorRecoveryMiddleware() {
  return createMiddleware({
    name: "ToolErrorRecoveryMiddleware",
    wrapToolCall: async (request, handler) => {
      try {
        return await handler(request);
      } catch (err) {
        if (!isRecoverableToolInputError(err)) throw err;
        const detail = describeToolInputError(err);
        const toolName = request.toolCall.name;
        return new ToolMessage({
          status: "error",
          name: toolName,
          tool_call_id: request.toolCall.id ?? "",
          content:
            `The call to the "${toolName}" tool had invalid arguments and was NOT executed: ` +
            `${detail}\n` +
            `Re-issue the call with every required argument set and matching the tool's schema.`,
        });
      }
    },
  });
}
