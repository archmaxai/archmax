import { describe, it, expect } from "vitest";
import { generateMcpToken, hashMcpToken } from "./McpToken";

describe("generateMcpToken", () => {
  it("returns raw token with sml_ prefix", () => {
    const { raw } = generateMcpToken();
    expect(raw.startsWith("sml_")).toBe(true);
  });

  it("raw token is 68 chars (4 prefix + 64 hex)", () => {
    const { raw } = generateMcpToken();
    expect(raw.length).toBe(68);
  });

  it("hash is a 64-char hex string (SHA-256)", () => {
    const { hash } = generateMcpToken();
    expect(hash.length).toBe(64);
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });

  it("hash matches re-hashing the raw token", () => {
    const { raw, hash } = generateMcpToken();
    expect(hashMcpToken(raw)).toBe(hash);
  });

  it("generates unique tokens each time", () => {
    const a = generateMcpToken();
    const b = generateMcpToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashMcpToken", () => {
  it("produces deterministic output", () => {
    const token = "sml_abc123";
    expect(hashMcpToken(token)).toBe(hashMcpToken(token));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashMcpToken("sml_token1")).not.toBe(hashMcpToken("sml_token2"));
  });
});
