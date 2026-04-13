import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockLlm, createTestAgent } from "../test-utils";

const { mockUpdateOne, mockFindByIdTestAgent, mockCreatePlaygroundAgent, mockLlmInvoke } = vi.hoisted(() => ({
  mockUpdateOne: vi.fn(),
  mockFindByIdTestAgent: vi.fn(),
  mockCreatePlaygroundAgent: vi.fn(),
  mockLlmInvoke: vi.fn(),
}));

vi.mock("../infra/db", () => ({ connectDB: vi.fn() }));

vi.mock("../models/index", () => ({
  TestRun: { updateOne: mockUpdateOne },
  TestAgent: { findById: mockFindByIdTestAgent },
}));

vi.mock("./playground-agent", () => ({
  createPlaygroundAgent: (...args: unknown[]) => mockCreatePlaygroundAgent(...args),
  getTestAgentRecursionLimit: vi.fn(() => 100),
  decryptApiKey: vi.fn((key: string) => key),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor() {}
    invoke = mockLlmInvoke;
  },
}));

import { truncate, evaluateFacts, processTestCase } from "./test-runner";

describe("truncate", () => {
  it("returns string unchanged when shorter than max", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns string unchanged when exactly max length", () => {
    expect(truncate("12345", 5)).toBe("12345");
  });

  it("truncates and adds ellipsis when longer than max", () => {
    const result = truncate("hello world", 5);
    expect(result).toBe("hello…");
    expect(result.length).toBe(6);
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("handles max of 0", () => {
    expect(truncate("hello", 0)).toBe("…");
  });
});

describe("evaluateFacts", () => {
  it("parses valid JSON array from LLM response", async () => {
    const factResults = [
      { fact: "Revenue is 1.65 MEUR", passed: true, reasoning: "The response mentions 1.65M EUR" },
      { fact: "Profit margin is 12%", passed: false, reasoning: "No mention of profit margin" },
    ];
    const llm = createMockLlm({ content: JSON.stringify(factResults) });

    const result = await evaluateFacts(
      "The total revenue is 1.65 million EUR.",
      ["Revenue is 1.65 MEUR", "Profit margin is 12%"],
      llm,
    );

    expect(result).toHaveLength(2);
    expect(result[0].passed).toBe(true);
    expect(result[1].passed).toBe(false);
  });

  it("extracts JSON array from response with surrounding text", async () => {
    const factResults = [{ fact: "Revenue is 100", passed: true, reasoning: "Match" }];
    const llm = createMockLlm({
      content: `Here is my evaluation:\n${JSON.stringify(factResults)}\nDone.`,
    });

    const result = await evaluateFacts("Revenue: 100", ["Revenue is 100"], llm);
    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(true);
  });

  it("returns all failed when LLM returns non-JSON content", async () => {
    const llm = createMockLlm({ content: "I cannot evaluate these facts." });

    const result = await evaluateFacts("response", ["fact1", "fact2"], llm);
    expect(result).toHaveLength(2);
    expect(result.every((f) => f.passed === false)).toBe(true);
    expect(result.every((f) => f.reasoning === "Evaluation failed")).toBe(true);
  });

  it("returns all failed when LLM returns non-string content", async () => {
    const llm = createMockLlm({ content: [{ type: "text", text: "..." }] as unknown as string });

    const result = await evaluateFacts("response", ["fact1"], llm);
    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
  });

  it("returns all failed when LLM throws an error", async () => {
    const llm = createMockLlm(new Error("API timeout"));

    const result = await evaluateFacts("response", ["fact1", "fact2", "fact3"], llm);
    expect(result).toHaveLength(3);
    expect(result.every((f) => f.passed === false)).toBe(true);
  });

  it("returns all failed when LLM returns empty string", async () => {
    const llm = createMockLlm({ content: "" });

    const result = await evaluateFacts("response", ["fact1"], llm);
    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
  });

  it("handles LLM response with malformed JSON", async () => {
    const llm = createMockLlm({ content: '[{"fact": "f1", "passed": true, broken' });

    const result = await evaluateFacts("response", ["f1"], llm);
    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
  });
});

describe("processTestCase", () => {
  const agentDoc = createTestAgent({
    semanticModels: ["hr", "shopify"],
    encryptedApiKey: "key",
    llmModel: "gpt-4o",
    llmBaseUrl: "https://api.openai.com/v1",
  });

  function makeMockAgent(response = "Total revenue is 100") {
    return {
      stream: vi.fn(async function* () {
        yield {
          messages: [
            {
              _getType: () => "ai",
              content: response,
              tool_calls: undefined,
            },
          ],
        };
      }),
    };
  }

  beforeEach(() => {
    mockUpdateOne.mockReset().mockResolvedValue({});
    mockFindByIdTestAgent.mockReset();
    mockCreatePlaygroundAgent.mockReset();
    mockLlmInvoke.mockReset().mockResolvedValue({
      content: JSON.stringify([{ fact: "Revenue is 100", passed: true, reasoning: "Match" }]),
    });
  });

  it("passes semanticModelScope to createPlaygroundAgent", async () => {
    const mockAgent = makeMockAgent();
    mockCreatePlaygroundAgent.mockResolvedValue(mockAgent);
    mockFindByIdTestAgent.mockReturnValue({ lean: () => Promise.resolve(agentDoc) });

    await processTestCase(
      "run-1", 0, "agent-1", "shopify",
      "What is the revenue?", ["Revenue is 100"],
    );

    expect(mockCreatePlaygroundAgent).toHaveBeenCalledWith(
      "agent-1",
      expect.objectContaining({ semanticModelScope: "shopify" }),
    );
  });

  it("passes maxToolCalls alongside semanticModelScope", async () => {
    const mockAgent = makeMockAgent();
    mockCreatePlaygroundAgent.mockResolvedValue(mockAgent);
    mockFindByIdTestAgent.mockReturnValue({ lean: () => Promise.resolve(agentDoc) });

    await processTestCase(
      "run-1", 0, "agent-1", "shopify",
      "What is the revenue?", ["Revenue is 100"], 5,
    );

    expect(mockCreatePlaygroundAgent).toHaveBeenCalledWith(
      "agent-1",
      { semanticModelScope: "shopify", maxToolCalls: 5 },
    );
  });

  it("does not set semanticModelScope when semanticModel is empty", async () => {
    const mockAgent = makeMockAgent();
    mockCreatePlaygroundAgent.mockResolvedValue(mockAgent);
    mockFindByIdTestAgent.mockReturnValue({ lean: () => Promise.resolve(agentDoc) });

    await processTestCase(
      "run-1", 0, "agent-1", "",
      "What is the revenue?", ["Revenue is 100"],
    );

    const opts = mockCreatePlaygroundAgent.mock.calls[0][1];
    expect(opts.semanticModelScope).toBeUndefined();
  });
});
