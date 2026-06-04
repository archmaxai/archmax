import { resolve } from "node:path";
import { createDeepAgent } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { getEnv } from "../config/env";
import { Connection, Project, type IConnectionDocument } from "../models/index";
import { connectDB } from "../infra/db";
import { ValidatingFilesystemBackend } from "./agent-filesystem";
import { createToolErrorRecoveryMiddleware } from "./agent-middleware";
import {
  makeExecuteQueryTool,
  makeRunModelQueryTool,
  makeDeleteTool,
  makeMvTool,
  makeCpTool,
  makeReadDocumentTool,
  makeRevertFileTool,
  makeDiscardAllChangesTool,
  makeListTestAgentsTool,
  makeListTestCasesTool,
  makeDeleteTestCaseTool,
  makeCreateTestCaseTool,
  buildSystemPrompt,
} from "./agent-tools";

export { ValidatingFilesystemBackend } from "./agent-filesystem";

const SAFE_PROJECT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export async function createSemlayerAgent(projectId: string): Promise<ReturnType<typeof createDeepAgent>> {
  if (!SAFE_PROJECT_ID.test(projectId)) {
    throw new Error("Invalid projectId");
  }
  const env = getEnv();
  const projectDir = resolve(env.projectsDir, projectId);

  await connectDB();
  const project = await Project.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const connections = (await Connection.find({
    project: projectId,
    isActive: true,
  }).lean()) as IConnectionDocument[];

  const llm = new ChatOpenAI({
    model: env.AGENT_MODEL,
    apiKey: env.AGENT_API_KEY,
    configuration: {
      baseURL: env.AGENT_API_BASE_URL,
    },
    maxRetries: Number(env.AGENT_MAX_RETRIES) || 3,
    timeout: (Number(env.AGENT_REQUEST_TIMEOUT) || 300) * 1000,
  });

  const backend = new ValidatingFilesystemBackend({
    rootDir: projectDir,
    virtualMode: true,
  });

  const executeQuery = makeExecuteQueryTool(projectId);
  const runModelQuery = makeRunModelQueryTool(projectId);
  const rmTool = makeDeleteTool(backend);
  const mvTool = makeMvTool(backend);
  const cpTool = makeCpTool(backend);
  const readDocTool = makeReadDocumentTool(projectId);
  const listTestAgentsTool = makeListTestAgentsTool(projectId);
  const listTestCasesTool = makeListTestCasesTool(projectId);
  const deleteTestCaseTool = makeDeleteTestCaseTool(projectId);
  const createTestCaseTool = makeCreateTestCaseTool(projectId);
  const revertFileTool = makeRevertFileTool(projectDir);
  const discardAllTool = makeDiscardAllChangesTool(projectDir);

  return createDeepAgent({
    model: llm,
    backend,
    tools: [executeQuery, runModelQuery, rmTool, mvTool, cpTool, readDocTool, revertFileTool, discardAllTool, listTestAgentsTool, listTestCasesTool, deleteTestCaseTool, createTestCaseTool],
    // Loads an optional project-root `AGENTS.md` (relative to the backend root,
    // which is `projectDir`) into the system prompt via the Deep Agents memory
    // middleware. The middleware tolerates a missing file, so the file stays
    // optional and no custom file-reading is needed.
    memory: ["AGENTS.md"],
    systemPrompt: buildSystemPrompt(connections),
    // Registered last so it is the innermost `wrapToolCall` layer: turns
    // malformed tool calls (e.g. `write_file` with missing `file_path`) into a
    // ToolMessage the model can recover from, instead of aborting the run.
    middleware: [createToolErrorRecoveryMiddleware()],
  });
}
