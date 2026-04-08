import { describe, it, expect } from "vitest";
import { maskApiKey, stripApiKey } from "./test-agents";

describe("maskApiKey", () => {
  it("returns masked placeholder for a truthy encrypted key", () => {
    expect(maskApiKey("abc123encrypted")).toBe("sk-...****");
  });

  it("returns empty string for empty encrypted key", () => {
    expect(maskApiKey("")).toBe("");
  });
});

describe("stripApiKey", () => {
  it("removes encryptedApiKey and adds apiKeySet + apiKeyMasked", () => {
    const agent = {
      _id: "123",
      name: "Test Agent",
      encryptedApiKey: "encrypted-value",
      llmModel: "gpt-4o",
    };
    const result = stripApiKey(agent);
    expect(result).not.toHaveProperty("encryptedApiKey");
    expect(result.apiKeySet).toBe(true);
    expect(result.apiKeyMasked).toBe("sk-...****");
    expect(result.name).toBe("Test Agent");
    expect(result.llmModel).toBe("gpt-4o");
  });

  it("sets apiKeySet false when encryptedApiKey is empty", () => {
    const agent = {
      _id: "123",
      name: "Agent",
      encryptedApiKey: "",
    };
    const result = stripApiKey(agent);
    expect(result.apiKeySet).toBe(false);
    expect(result.apiKeyMasked).toBe("");
  });

  it("sets apiKeySet false when encryptedApiKey is undefined", () => {
    const agent = {
      _id: "123",
      name: "Agent",
    };
    const result = stripApiKey(agent);
    expect(result.apiKeySet).toBe(false);
  });

  it("preserves all other fields", () => {
    const agent = {
      _id: "456",
      name: "My Agent",
      semanticModels: ["model-a"],
      systemPrompt: "You are a tester",
      llmBaseUrl: "https://api.openai.com/v1",
      llmModel: "gpt-4o",
      encryptedApiKey: "secret",
      createdAt: "2025-01-01",
    };
    const result = stripApiKey(agent);
    expect(result._id).toBe("456");
    expect(result.name).toBe("My Agent");
    expect(result.semanticModels).toEqual(["model-a"]);
    expect(result.systemPrompt).toBe("You are a tester");
    expect(result.llmBaseUrl).toBe("https://api.openai.com/v1");
    expect(result.llmModel).toBe("gpt-4o");
    expect(result.createdAt).toBe("2025-01-01");
    expect(result.apiKeySet).toBe(true);
    expect(result.apiKeyMasked).toBe("sk-...****");
  });

  it("does not mutate the original object", () => {
    const agent = {
      _id: "789",
      name: "Agent",
      encryptedApiKey: "value",
    };
    stripApiKey(agent);
    expect(agent.encryptedApiKey).toBe("value");
  });
});
