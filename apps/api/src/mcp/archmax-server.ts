import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { McpCallLog, Improvement } from "@archmax/core/models/index";
import { connectDB } from "@archmax/core/infra/db";
import { SemanticModelFileService } from "@archmax/core/services/semantic-model-files";
import {
  listSemanticModels,
  getSemanticModelOverview,
  getDatasetFields,
  executeScopedQuery,
  storeQuery,
  executeStoredQuery,
  EXECUTE_QUERY_DESCRIPTION,
  EXECUTE_STORED_QUERY_DESCRIPTION,
  type ToolResult,
  type ExecuteQueryResult,
} from "@archmax/core/services/mcp-tools";

export interface McpAuthContext {
  projectId: string;
  scopes: string[];
  tokenId: string | null;
  tokenName: string;
  clientIp: string;
  mcpPageSize: number;
}

export interface McpToolContext extends McpAuthContext {
  fileSvc: SemanticModelFileService;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

type McpResult = { content: { type: "text"; text: string }[]; isError?: true };

function toMcpResult(r: ToolResult): McpResult {
  return r.isError ? errorResult(r.text) : textResult(r.text);
}

function summariseQueryResult(r: ExecuteQueryResult): McpResult {
  return r.isError
    ? errorResult(r.text)
    : textResult(`${r.rowCount ?? 0} rows, ${r.columns?.length ?? 0} columns`);
}

export async function writeCallLog(
  ctx: McpToolContext,
  toolName: string,
  inputArgs: Record<string, unknown> | null,
  result: McpResult,
  durationMs: number,
): Promise<void> {
  try {
    await connectDB();
    await McpCallLog.create({
      project: ctx.projectId,
      tokenId: ctx.tokenId,
      tokenName: ctx.tokenName,
      method: "tools/call",
      toolName,
      inputArgs,
      outputContent: result.content.map((c) => c.text).join("\n"),
      durationMs,
      isError: result.isError ?? false,
      errorMessage: result.isError ? result.content.map((c) => c.text).join("\n") : null,
      clientIp: ctx.clientIp,
    });
  } catch (err) {
    console.error("[MCP] Failed to write call log:", err);
  }
}

type ToolHandler<A = void> = (args: A) => Promise<{
  result: McpResult;
  logResult?: McpResult;
  inputArgs: Record<string, unknown> | null;
}>;

async function loggedTool<A = void>(
  ctx: McpToolContext,
  toolName: string,
  handler: ToolHandler<A>,
  args: A,
): Promise<McpResult> {
  const start = Date.now();
  try {
    const { result, logResult, inputArgs } = await handler(args);
    writeCallLog(ctx, toolName, inputArgs, logResult ?? result, Date.now() - start);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal tool error";
    const result = errorResult(msg);
    writeCallLog(ctx, toolName, null, result, Date.now() - start);
    throw err;
  }
}

export async function registerArchmaxTools(server: McpServer, ctx: McpToolContext): Promise<void> {
  const { projectId, scopes, fileSvc } = ctx;

  server.registerTool("list_semantic_models", {
    description: "List semantic models you have access to (reads from YAML files on disk)",
    annotations: { readOnlyHint: true },
  }, () => loggedTool(ctx, "list_semantic_models", async () => {
    const r = await listSemanticModels(fileSvc, projectId, scopes);
    return { result: toMcpResult(r), inputArgs: null };
  }, undefined as void));

  server.registerTool("get_semantic_model", {
    description:
      "Get an overview of a semantic model with datasets, relationships, and metrics. " +
      "Supports scoped pagination: use scope to drill into a specific section independently. " +
      "Use this first to understand the model structure, then drill into specific datasets with get_datasets.",
    inputSchema: z.object({
      modelName: z.string().describe("The semantic model name (filename without .yaml)"),
      scope: z.enum(["datasets", "relationships", "metrics"]).optional()
        .describe("Section to retrieve independently. Omit for full overview (first page of each section)."),
      page: z.number().optional()
        .describe("Page number within the scope (default 1, items per page configured per project). Only meaningful with scope."),
    }),
    annotations: { readOnlyHint: true },
  }, ({ modelName, scope, page }) => loggedTool(ctx, "get_semantic_model", async () => {
    const inputArgs = { modelName, scope, page };
    const r = await getSemanticModelOverview(fileSvc, projectId, scopes, modelName, {
      scope, page, itemsPerPage: ctx.mcpPageSize, showTableNames: true,
    });
    return { result: toMcpResult(r), inputArgs };
  }, undefined as void));

  server.registerTool("get_datasets", {
    description:
      "Get one or more datasets with all their fields as compact markdown lists with types, examples, enums, synonyms, and instructions. " +
      "Pass up to 10 datasets in a single call to reduce round-trips. " +
      "Each dataset entry specifies its own page for independent field pagination.",
    inputSchema: z.object({
      modelName: z.string().describe("The semantic model name (filename without .yaml)"),
      datasets: z.array(z.object({
        name: z.string().describe("Dataset name within the model"),
        page: z.number().optional().describe("Page number for this dataset's fields (default 1)"),
      })).min(1).max(10).describe("Datasets to retrieve (1–10), each with an optional page"),
    }),
    annotations: { readOnlyHint: true },
  }, ({ modelName, datasets }) => loggedTool(ctx, "get_datasets", async () => {
    const inputArgs = { modelName, datasets };
    const r = await getDatasetFields(fileSvc, projectId, scopes, modelName, datasets, {
      itemsPerPage: ctx.mcpPageSize,
    });
    return { result: toMcpResult(r), inputArgs };
  }, undefined as void));

  server.registerTool("execute_query", {
    description: EXECUTE_QUERY_DESCRIPTION,
    inputSchema: z.object({
      modelName: z.string().describe("The semantic model whose datasets become available as tables"),
      sql: z.string().describe("DuckDB SQL query using dataset names as table names, with $1, $2, ... placeholders"),
      params: z.array(z.string()).optional().default([])
        .describe("Parameter values for positional placeholders"),
      store: z.boolean().optional().default(true)
        .describe("When true (default), the query is stored and a storedQueryId is returned for later re-execution via execute_stored_query"),
    }),
    annotations: { readOnlyHint: true },
  }, ({ modelName, sql, params, store }) => loggedTool(ctx, "execute_query", async () => {
    const inputArgs: Record<string, unknown> = { modelName, sql };
    const r = await executeScopedQuery(fileSvc, projectId, scopes, modelName, sql, params);

    if (!r.isError && store) {
      try {
        const storedQueryId = await storeQuery(projectId, ctx.tokenId, modelName, sql, params);
        const parsed = JSON.parse(r.text);
        parsed.storedQueryId = storedQueryId;
        r.text = JSON.stringify(parsed);
        r.storedQueryId = storedQueryId;
      } catch (err) {
        console.error("[MCP] Failed to store query:", err);
      }
    }

    if (r.rowCount !== undefined) inputArgs.rowCount = r.rowCount;
    const result = r.isError ? errorResult(r.text) : textResult(r.text);
    return { result, logResult: summariseQueryResult(r), inputArgs };
  }, undefined as void));

  server.registerTool("execute_stored_query", {
    description: EXECUTE_STORED_QUERY_DESCRIPTION,
    inputSchema: z.object({
      storedQueryId: z.string().describe("The stored query ID returned by a previous execute_query call"),
      params: z.array(z.string()).optional()
        .describe("Override parameter values; if omitted, the original stored params are used"),
    }),
    annotations: { readOnlyHint: true },
  }, ({ storedQueryId, params }) => loggedTool(ctx, "execute_stored_query", async () => {
    const inputArgs: Record<string, unknown> = { storedQueryId };
    const r = await executeStoredQuery(fileSvc, projectId, scopes, storedQueryId, params);
    if (r.rowCount !== undefined) inputArgs.rowCount = r.rowCount;
    const result = r.isError ? errorResult(r.text) : textResult(r.text);
    return { result, logResult: summariseQueryResult(r), inputArgs };
  }, undefined as void));

  server.registerTool("request_improvement", {
    description:
      "Submit an improvement request for a semantic model. " +
      "Use this when you or a user discover issues like missing fields, incorrect descriptions, " +
      "wrong relationships, or any other quality problem with a semantic model.",
    inputSchema: z.object({
      modelName: z.string().describe("The semantic model this improvement applies to"),
      title: z.string().max(200).describe("Short summary of the improvement (max 200 chars)"),
      description: z.string().max(2000).describe("Detailed description of the issue or requested change (max 2000 chars)"),
    }),
    annotations: { readOnlyHint: false },
  }, ({ modelName, title, description }) => loggedTool(ctx, "request_improvement", async () => {
    const inputArgs = { modelName, title, description };

    if (!scopes.includes(modelName)) {
      return { result: errorResult(`Access denied: model "${modelName}" is not in your token's scope`), inputArgs };
    }

    const models = await fileSvc.list(projectId);
    const modelExists = models.some((m: { name: string }) => m.name === modelName);
    if (!modelExists) {
      return { result: errorResult(`Model "${modelName}" not found in this project`), inputArgs };
    }

    await connectDB();
    await Improvement.create({
      project: projectId,
      modelName,
      title,
      description,
      createdVia: ctx.tokenName,
    });

    return { result: textResult("Improvement request submitted successfully"), inputArgs };
  }, undefined as void));

}
