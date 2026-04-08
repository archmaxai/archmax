import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    invoke = mockInvoke;
    constructor() {}
  },
}));

const mockEnv: Record<string, string | undefined> = {
  AGENT_API_KEY: "test-key",
  AGENT_TITLE_MODEL: "test-model",
  AGENT_API_BASE_URL: "https://test.example.com",
};
vi.mock("@semlayer/core/config/env", () => ({
  getEnv: vi.fn(() => mockEnv),
}));

import { truncateTitle, generateTitle } from "./title-agent";

describe("truncateTitle", () => {
  it("returns short messages unchanged", () => {
    expect(truncateTitle("Hello")).toBe("Hello");
  });

  it("returns exactly 60-char messages unchanged", () => {
    const msg = "a".repeat(60);
    expect(truncateTitle(msg)).toBe(msg);
  });

  it("truncates messages longer than 60 chars", () => {
    const msg = "a".repeat(80);
    const result = truncateTitle(msg);
    expect(result).toBe("a".repeat(57) + "...");
    expect(result.length).toBe(60);
  });

  it("handles empty string", () => {
    expect(truncateTitle("")).toBe("");
  });
});

describe("generateTitle", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockEnv.AGENT_API_KEY = "test-key";
  });

  it("returns LLM-generated title", async () => {
    mockInvoke.mockResolvedValue({ content: "Semantic model for orders" });
    const title = await generateTitle("Can you help me create a semantic model for the orders table?");
    expect(title).toBe("Semantic model for orders");
    expect(mockInvoke).toHaveBeenCalledOnce();
  });

  it("trims whitespace from LLM response", async () => {
    mockInvoke.mockResolvedValue({ content: "  Orders model setup  \n" });
    const title = await generateTitle("help with orders");
    expect(title).toBe("Orders model setup");
  });

  it("truncates LLM response longer than 80 chars", async () => {
    const longTitle = "A".repeat(100);
    mockInvoke.mockResolvedValue({ content: longTitle });
    const title = await generateTitle("some message");
    expect(title).toBe("A".repeat(77) + "...");
    expect(title.length).toBe(80);
  });

  it("falls back to truncated message when API key is missing", async () => {
    mockEnv.AGENT_API_KEY = undefined;
    const msg = "Can you help me create a semantic model for the orders table in my database?";
    const title = await generateTitle(msg);
    expect(title).toBe(truncateTitle(msg));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("falls back to truncated message when LLM throws", async () => {
    mockInvoke.mockRejectedValue(new Error("API timeout"));
    const msg = "Create a model";
    const title = await generateTitle(msg);
    expect(title).toBe("Create a model");
  });

  it("falls back to truncated message when LLM returns empty string", async () => {
    mockInvoke.mockResolvedValue({ content: "   " });
    const msg = "This is a reasonably long message that should be truncated by the fallback path";
    const title = await generateTitle(msg);
    expect(title).toBe(truncateTitle(msg));
  });

  it("falls back when LLM returns non-string content", async () => {
    mockInvoke.mockResolvedValue({ content: [{ type: "text", text: "hi" }] });
    const msg = "some message";
    const title = await generateTitle(msg);
    expect(title).toBe("some message");
  });
});
