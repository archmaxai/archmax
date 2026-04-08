import { Types } from "mongoose";

function objectId(): string {
  return new Types.ObjectId().toString();
}

export function createProject(overrides: Record<string, unknown> = {}) {
  return {
    _id: objectId(),
    title: "Test Project",
    slug: "test-project",
    description: "",
    mcpPageSize: 50,
    deleted: false,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createConnection(overrides: Record<string, unknown> = {}) {
  return {
    _id: objectId(),
    project: objectId(),
    name: "Test Connection",
    slug: "test-connection",
    type: "postgres",
    connectionConfig: { host: "localhost", port: 5432, database: "testdb", user: "admin", password: "secret" },
    description: "",
    isActive: true,
    deleted: false,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createConversation(overrides: Record<string, unknown> = {}) {
  return {
    _id: objectId(),
    project: objectId(),
    testAgent: null,
    title: "New conversation",
    messages: [],
    deleted: false,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMcpToken(overrides: Record<string, unknown> = {}) {
  return {
    _id: objectId(),
    name: "Test Token",
    tokenHash: "sha256-hash-placeholder",
    project: objectId(),
    scopes: [],
    expiresAt: null,
    lastUsedAt: null,
    deleted: false,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestAgent(overrides: Record<string, unknown> = {}) {
  return {
    _id: objectId(),
    name: "Test Agent",
    project: objectId(),
    semanticModels: ["test-model"],
    systemPrompt: "You are a helpful data analyst.",
    llmBaseUrl: "https://api.openai.com/v1",
    encryptedApiKey: "encrypted-key-placeholder",
    llmModel: "gpt-4o",
    deleted: false,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestCase(overrides: Record<string, unknown> = {}) {
  return {
    _id: objectId(),
    title: "Test Case",
    project: objectId(),
    testAgent: objectId(),
    semanticModel: "test-model",
    inputMessage: "What is the total revenue?",
    expectedFacts: ["Revenue is calculated using SUM of orders.total_amount"],
    tags: [],
    maxToolCalls: undefined,
    deleted: false,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestRun(overrides: Record<string, unknown> = {}) {
  return {
    _id: objectId(),
    project: objectId(),
    testAgent: objectId(),
    status: "pending" as const,
    cases: [],
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestCaseResult(overrides: Record<string, unknown> = {}) {
  return {
    testCase: objectId(),
    title: "Test Case",
    semanticModel: "test-model",
    inputMessage: "What is the total revenue?",
    expectedFacts: ["Revenue is 1.65 MEUR"],
    maxToolCalls: undefined,
    status: "pending" as const,
    agentResponse: "",
    toolCalls: [],
    factResults: [],
    durationMs: 0,
    errorMessage: undefined,
    ...overrides,
  };
}

export function createImprovement(overrides: Record<string, unknown> = {}) {
  return {
    _id: objectId(),
    project: objectId(),
    modelName: "test-model",
    title: "Improve field description",
    description: "The revenue field should include currency information.",
    status: "pending" as const,
    implementedAt: null,
    createdVia: "mcp",
    deleted: false,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
