import { describe, it, expect, vi, beforeEach } from "vitest";
import { encrypt } from "../infra/crypto";

const mockEnv: Record<string, string | undefined> = {
  ENCRYPTION_KEY: "test-encryption-key-32-chars-ok!",
  TEST_AGENT_MAX_ITERATIONS: "100",
  SEMLAYER_DATA_DIR: "/tmp/test",
};

vi.mock("../config/env", () => ({
  getEnv: vi.fn(() => mockEnv),
}));

vi.mock("../infra/db", () => ({
  connectDB: vi.fn(),
}));

vi.mock("../models/index", () => ({
  TestAgent: { findById: vi.fn() },
}));

vi.mock("deepagents", () => ({
  createDeepAgent: vi.fn(),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor() {}
  },
}));

vi.mock("@langchain/core/tools", () => ({
  tool: vi.fn(() => ({})),
}));

vi.mock("./semantic-model-files", () => ({
  SemanticModelFileService: class MockFileSvc {
    constructor() {}
  },
}));

vi.mock("./mcp-tools", () => ({
  listSemanticModels: vi.fn(),
  getSemanticModelOverview: vi.fn(),
  getDatasetFields: vi.fn(),
  executeScopedQuery: vi.fn(),
  EXECUTE_QUERY_DESCRIPTION: "Execute a query",
}));

import { getTestAgentRecursionLimit, decryptApiKey } from "./playground-agent";

describe("getTestAgentRecursionLimit", () => {
  beforeEach(() => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "100";
  });

  it("returns configured value from env", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "50";
    expect(getTestAgentRecursionLimit()).toBe(50);
  });

  it("returns default 100 when env is undefined", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = undefined;
    expect(getTestAgentRecursionLimit()).toBe(100);
  });

  it("returns default 100 when env is empty string", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "";
    expect(getTestAgentRecursionLimit()).toBe(100);
  });

  it("returns default 100 when env is 0", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "0";
    expect(getTestAgentRecursionLimit()).toBe(100);
  });

  it("returns default 100 when env is negative", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "-5";
    expect(getTestAgentRecursionLimit()).toBe(100);
  });

  it("returns default 100 when env is not a number", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "abc";
    expect(getTestAgentRecursionLimit()).toBe(100);
  });

  it("handles large values", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "10000";
    expect(getTestAgentRecursionLimit()).toBe(10000);
  });
});

describe("decryptApiKey", () => {
  beforeEach(() => {
    mockEnv.ENCRYPTION_KEY = "test-encryption-key-32-chars-ok!";
  });

  it("decrypts a properly encrypted key", () => {
    const original = "sk-test-api-key-12345";
    const encrypted = encrypt(original, mockEnv.ENCRYPTION_KEY!);
    expect(decryptApiKey(encrypted)).toBe(original);
  });

  it("returns raw value when ENCRYPTION_KEY is not set", () => {
    mockEnv.ENCRYPTION_KEY = undefined;
    expect(decryptApiKey("raw-api-key")).toBe("raw-api-key");
  });

  it("returns raw value when ENCRYPTION_KEY is empty", () => {
    mockEnv.ENCRYPTION_KEY = "";
    expect(decryptApiKey("raw-api-key")).toBe("raw-api-key");
  });

  it("returns encrypted string unchanged when decryption fails", () => {
    mockEnv.ENCRYPTION_KEY = "some-key";
    expect(decryptApiKey("not-valid-hex-encrypted-data")).toBe("not-valid-hex-encrypted-data");
  });

  it("returns encrypted string when key changed after encryption", () => {
    const original = "sk-test-key";
    const encrypted = encrypt(original, "original-encryption-key-32chars!");
    mockEnv.ENCRYPTION_KEY = "different-encryption-key-32chars!";
    expect(decryptApiKey(encrypted)).toBe(encrypted);
  });
});
