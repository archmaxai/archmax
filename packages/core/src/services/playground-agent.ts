import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { tool, StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { connectDB } from "../infra/db";
import { decrypt } from "../infra/crypto";
import { getEnv } from "../config/env";
import { TestAgent, Improvement, type ITestAgentDocument } from "../models/index";
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
    async ({ modelName, datasets }) => {
      const r = await getDatasetFields(fileSvc, projectId, scopes, modelName, datasets, {});
      return r.text;
    },
    {
      name: "get_datasets",
      description:
        "Get one or more datasets with all their fields as compact markdown lists. " +
        "Pass up to 10 datasets in a single call, each with an optional page for field pagination.",
      schema: z.object({
        modelName: z.string().describe("The semantic model name"),
        datasets: z.array(z.object({
          name: z.string().describe("Dataset name"),
          page: z.number().optional().describe("Page number (default 1)"),
        })).min(1).max(10).describe("Datasets to retrieve (1–10)"),
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

function makeRequestImprovementTool(fileSvc: SemanticModelFileService, projectId: string, scopes: string[], tokenName: string) {
  return tool(
    async ({ modelName, title, description }) => {
      if (!scopes.includes(modelName)) {
        return `Access denied: model "${modelName}" is not in your scope`;
      }
      const models = await fileSvc.list(projectId);
      if (!models.some((m: { name: string }) => m.name === modelName)) {
        return `Model "${modelName}" not found in this project`;
      }
      await connectDB();
      await Improvement.create({ project: projectId, modelName, title, description, createdVia: tokenName });
      return "Improvement request submitted successfully";
    },
    {
      name: "request_improvement",
      description:
        "Submit an improvement request for a semantic model. " +
        "Use when you or a user discover issues like missing fields, incorrect descriptions, or wrong relationships.",
      schema: z.object({
        modelName: z.string().describe("The semantic model this improvement applies to"),
        title: z.string().max(200).describe("Short summary of the improvement (max 200 chars)"),
        description: z.string().max(2000).describe("Detailed description of the issue or requested change (max 2000 chars)"),
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

function withToolBudget(tools: StructuredTool[], maxCalls: number): StructuredTool[] {
  const counter = { value: 0 };
  return tools.map((t) =>
    tool(
      async (input: Record<string, unknown>) => {
        counter.value++;
        if (counter.value > maxCalls) {
          return `Tool call budget of ${maxCalls} reached. You MUST provide your final answer now using the information already gathered. Do NOT call any more tools.`;
        }
        return String(await t.invoke(input));
      },
      { name: t.name, description: t.description, schema: t.schema as z.ZodObject<any> },
    ),
  );
}

export interface PlaygroundAgentOptions {
  maxToolCalls?: number;
}

export async function createPlaygroundAgent(
  testAgentId: string,
  options?: PlaygroundAgentOptions,
): Promise<ReturnType<typeof createDeepAgent>> {
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

  const fileSvc = new SemanticModelFileService(env.ARCHMAX_DATA_DIR);
  const projectId = agent.project.toString();
  const scopes = agent.semanticModels;

  let tools: StructuredTool[] = [
    makeListModelsTool(fileSvc, projectId, scopes),
    makeGetOverviewTool(fileSvc, projectId, scopes),
    makeGetDatasetsTool(fileSvc, projectId, scopes),
    makeExecuteQueryTool(fileSvc, projectId, scopes),
    makeRequestImprovementTool(fileSvc, projectId, scopes, agent.name),
  ];

  if (options?.maxToolCalls) {
    tools = withToolBudget(tools, options.maxToolCalls);
  }

  return createDeepAgent({
    model: llm,
    tools,
    systemPrompt: agent.systemPrompt,
  });
}
