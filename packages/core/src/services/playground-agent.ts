import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod/v4";
import { connectDB } from "../infra/db";
import { decrypt } from "../infra/crypto";
import { getEnv } from "../config/env";
import { TestAgent, type ITestAgentDocument } from "../models/index";
import { SemanticModelFileService } from "./semantic-model-files";
import {
  listSemanticModels,
  getSemanticModelOverview,
  getDatasetFields,
  executeScopedQuery,
  EXECUTE_QUERY_DESCRIPTION,
} from "./mcp-tools";

export function decryptApiKey(encrypted: string): string {
  const key = getEnv().ENCRYPTION_KEY;
  if (!key) return encrypted;
  try {
    return decrypt(encrypted, key);
  } catch {
    return encrypted;
  }
}

function makeListModelsTool(fileSvc: SemanticModelFileService, projectId: string, scopes: string[]) {
  return tool(
    async () => {
      const r = await listSemanticModels(fileSvc, projectId, scopes);
      return r.text;
    },
    {
      name: "list_semantic_models",
      description: "List semantic models you have access to",
      schema: z.object({}),
    },
  );
}

function makeGetOverviewTool(fileSvc: SemanticModelFileService, projectId: string, scopes: string[]) {
  return tool(
    async ({ modelName, scope, page }) => {
      const r = await getSemanticModelOverview(fileSvc, projectId, scopes, modelName, {
        scope: scope as "datasets" | "relationships" | "metrics" | undefined,
        page,
        showViewNames: true,
      });
      return r.text;
    },
    {
      name: "get_semantic_model",
      description:
        "Get an overview of a semantic model with datasets, relationships, and metrics. " +
        "Use this to understand the model structure, then drill into specific datasets.",
      schema: z.object({
        modelName: z.string().describe("The semantic model name"),
        scope: z.enum(["datasets", "relationships", "metrics"]).optional().describe("Section to retrieve"),
        page: z.number().optional().describe("Page number (default 1)"),
      }),
    },
  );
}

function makeGetDatasetsTool(fileSvc: SemanticModelFileService, projectId: string, scopes: string[]) {
  return tool(
    async ({ modelName, datasetNames, page }) => {
      const r = await getDatasetFields(fileSvc, projectId, scopes, modelName, datasetNames, { page });
      return r.text;
    },
    {
      name: "get_datasets",
      description:
        "Get one or more datasets with all their fields as compact markdown lists. " +
        "Pass up to 10 dataset names in a single call.",
      schema: z.object({
        modelName: z.string().describe("The semantic model name"),
        datasetNames: z.array(z.string()).min(1).max(10).describe("Dataset names (1–10)"),
        page: z.number().optional().describe("Page number (default 1)"),
      }),
    },
  );
}

function makeExecuteQueryTool(fileSvc: SemanticModelFileService, projectId: string, scopes: string[]) {
  return tool(
    async ({ modelName, sql, params }) => {
      const r = await executeScopedQuery(fileSvc, projectId, scopes, modelName, sql, params);
      return r.text;
    },
    {
      name: "execute_query",
      description: EXECUTE_QUERY_DESCRIPTION,
      schema: z.object({
        modelName: z.string().describe("The semantic model whose datasets become scoped VIEWs"),
        sql: z.string().describe("SQL query with $1, $2, ... placeholders"),
        params: z.array(z.string()).optional().default([]).describe("Parameter values"),
      }),
    },
  );
}

const DEFAULT_MAX_ITERATIONS = 100;

export function getTestAgentRecursionLimit(): number {
  const env = getEnv();
  const configured = Number(env.TEST_AGENT_MAX_ITERATIONS);
  return configured > 0 ? configured : DEFAULT_MAX_ITERATIONS;
}

export async function createPlaygroundAgent(testAgentId: string): Promise<ReturnType<typeof createDeepAgent>> {
  await connectDB();
  const agent = await TestAgent.findById(testAgentId).lean() as ITestAgentDocument | null;
  if (!agent) throw new Error("Test agent not found");

  const env = getEnv();
  const apiKey = decryptApiKey(agent.encryptedApiKey);

  const llm = new ChatOpenAI({
    model: agent.llmModel,
    apiKey,
    configuration: { baseURL: agent.llmBaseUrl },
  });

  const fileSvc = new SemanticModelFileService(env.SEMLAYER_DATA_DIR);
  const projectId = agent.project.toString();
  const scopes = agent.semanticModels;

  const tools = [
    makeListModelsTool(fileSvc, projectId, scopes),
    makeGetOverviewTool(fileSvc, projectId, scopes),
    makeGetDatasetsTool(fileSvc, projectId, scopes),
    makeExecuteQueryTool(fileSvc, projectId, scopes),
  ];

  return createDeepAgent({
    model: llm,
    tools,
    systemPrompt: agent.systemPrompt,
  });
}
