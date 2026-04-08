import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { McpCallLog, Improvement } from "@archsem/core/models/index";
import { connectDB } from "@archsem/core/infra/db";
import { SemanticModelFileService } from "@archsem/core/services/semantic-model-files";
import {
  listSemanticModels,
  getSemanticModelOverview,
  getDatasetFields,
  executeScopedQuery,
  EXECUTE_QUERY_DESCRIPTION,
  type ToolResult,
} from "@archsem/core/services/mcp-tools";

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

function logCall(
  ctx: McpToolContext,
  toolName: string,
  inputArgs: Record<string, unknown> | null,
  result: McpResult,
  durationMs: number,
) {
  McpCallLog.create({
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
  }).catch((err) => console.error("[MCP] Failed to write call log:", err));
}

export async function registerArchsemTools(server: McpServer, ctx: McpToolContext): Promise<void> {
  const { projectId, scopes, fileSvc } = ctx;

  server.registerTool("list_semantic_models", {
    description: "List semantic models you have access to (reads from YAML files on disk)",
    annotations: { readOnlyHint: true },
  }, async () => {
    const start = Date.now();
    const r = await listSemanticModels(fileSvc, projectId, scopes);
    const result = toMcpResult(r);
    logCall(ctx, "list_semantic_models", null, result, Date.now() - start);
    return result;
  });

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
  }, async ({ modelName, scope, page }) => {
    const start = Date.now();
    const args = { modelName, scope, page };
    const r = await getSemanticModelOverview(fileSvc, projectId, scopes, modelName, {
      scope, page, itemsPerPage: ctx.mcpPageSize, showViewNames: true,
    });
    const result = toMcpResult(r);
    logCall(ctx, "get_semantic_model", args, result, Date.now() - start);
    return result;
  });

  server.registerTool("get_datasets", {
    description:
      "Get one or more datasets with all their fields as compact markdown lists with types, examples, enums, synonyms, and instructions. " +
      "Pass up to 10 dataset names in a single call to reduce round-trips. " +
      "When a single dataset is requested, the page parameter enables field pagination. " +
      "When multiple datasets are requested, page 1 of each is returned.",
    inputSchema: z.object({
      modelName: z.string().describe("The semantic model name (filename without .yaml)"),
      datasetNames: z.array(z.string()).min(1).max(10).describe("Dataset names within the model (1–10)"),
      page: z.number().optional().describe("Page number (default 1, only used when a single dataset is requested)"),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ modelName, datasetNames, page }) => {
    const start = Date.now();
    const args = { modelName, datasetNames, page: page ?? 1 };
    const r = await getDatasetFields(fileSvc, projectId, scopes, modelName, datasetNames, {
      page, itemsPerPage: ctx.mcpPageSize,
    });
    const result = toMcpResult(r);
    logCall(ctx, "get_datasets", args, result, Date.now() - start);
    return result;
  });

  server.registerTool("execute_query", {
    description: EXECUTE_QUERY_DESCRIPTION,
    inputSchema: z.object({
      modelName: z.string().describe("The semantic model whose datasets become _scope_<modelName>.* VIEWs"),
      sql: z.string().describe('SQL query using _scope_<modelName>."<datasetName>" VIEWs, with $1, $2, ... placeholders'),
      params: z.array(z.string()).optional().default([])
        .describe("Parameter values for positional placeholders"),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ modelName, sql, params }) => {
    const start = Date.now();
    const args: Record<string, unknown> = { modelName, sql, rowCount: 0 };
    const r = await executeScopedQuery(fileSvc, projectId, scopes, modelName, sql, params);
    if (r.rowCount !== undefined) args.rowCount = r.rowCount;
    const result = r.isError
      ? errorResult(r.text)
      : textResult(r.text);
    const logResult = r.isError
      ? result
      : textResult(`${r.rowCount ?? 0} rows, ${r.columns?.length ?? 0} columns`);
    logCall(ctx, "execute_query", args, logResult, Date.now() - start);
    return result;
  });

  server.registerTool("suggest_improvement", {
    description:
      "Submit an improvement suggestion for a semantic model. " +
      "Use this when you or a user discover issues like missing fields, incorrect descriptions, " +
      "wrong relationships, or any other quality problem with a semantic model.",
    inputSchema: z.object({
      modelName: z.string().describe("The semantic model this improvement applies to"),
      title: z.string().max(200).describe("Short summary of the improvement (max 200 chars)"),
      description: z.string().max(2000).describe("Detailed description of the issue or suggested change (max 2000 chars)"),
    }),
    annotations: { readOnlyHint: false },
  }, async ({ modelName, title, description }) => {
    const start = Date.now();
    const args = { modelName, title, description };

    if (!scopes.includes(modelName)) {
      const result = errorResult(`Access denied: model "${modelName}" is not in your token's scope`);
      logCall(ctx, "suggest_improvement", args, result, Date.now() - start);
      return result;
    }

    const models = await fileSvc.list(projectId);
    const modelExists = models.some((m: { name: string }) => m.name === modelName);
    if (!modelExists) {
      const result = errorResult(`Model "${modelName}" not found in this project`);
      logCall(ctx, "suggest_improvement", args, result, Date.now() - start);
      return result;
    }

    await connectDB();
    await Improvement.create({
      project: projectId,
      modelName,
      title,
      description,
      createdVia: ctx.tokenName,
    });

    const result = textResult("Improvement suggestion submitted successfully");
    logCall(ctx, "suggest_improvement", args, result, Date.now() - start);
    return result;
  });

}
