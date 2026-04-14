import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const BASE_ENV = {
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
  UI_PASSWORD: "test-password",
};

describe("env — APP_BASE_URL derivation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, ...BASE_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function loadGetEnv() {
    const mod = await import("./env.js");
    return mod.getEnv;
  }

  it("derives both AUTH_BASE_URL and corsOrigins from APP_BASE_URL", async () => {
    process.env.APP_BASE_URL = "https://archmax.example.com";
    delete process.env.AUTH_BASE_URL;
    delete process.env.CORS_ORIGINS;

    const getEnv = await loadGetEnv();
    const env = getEnv();

    expect(env.AUTH_BASE_URL).toBe("https://archmax.example.com");
    expect(env.corsOrigins).toEqual(["https://archmax.example.com"]);
  });

  it("explicit CORS_ORIGINS overrides APP_BASE_URL", async () => {
    process.env.APP_BASE_URL = "https://archmax.example.com";
    process.env.CORS_ORIGINS =
      "https://archmax.example.com,https://other.example.com";
    delete process.env.AUTH_BASE_URL;

    const getEnv = await loadGetEnv();
    const env = getEnv();

    expect(env.corsOrigins).toEqual([
      "https://archmax.example.com",
      "https://other.example.com",
    ]);
    expect(env.AUTH_BASE_URL).toBe("https://archmax.example.com");
  });

  it("explicit AUTH_BASE_URL overrides APP_BASE_URL", async () => {
    process.env.APP_BASE_URL = "https://archmax.example.com";
    process.env.AUTH_BASE_URL = "https://auth.internal:3000";
    delete process.env.CORS_ORIGINS;

    const getEnv = await loadGetEnv();
    const env = getEnv();

    expect(env.AUTH_BASE_URL).toBe("https://auth.internal:3000");
    expect(env.corsOrigins).toEqual(["https://archmax.example.com"]);
  });

  it("falls back to localhost defaults when neither APP_BASE_URL nor overrides are set", async () => {
    delete process.env.APP_BASE_URL;
    delete process.env.AUTH_BASE_URL;
    delete process.env.CORS_ORIGINS;

    const getEnv = await loadGetEnv();
    const env = getEnv();

    expect(env.AUTH_BASE_URL).toBeUndefined();
    expect(env.corsOrigins).toEqual(["http://localhost:5173"]);
  });

  it("warns on stderr in production when APP_BASE_URL is not set", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.APP_BASE_URL;

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("./env.js");
    await mod.validateEnvOrSleep();

    const output = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("APP_BASE_URL is not set");
    spy.mockRestore();
  });

  it("does not warn when APP_BASE_URL is set in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_BASE_URL = "https://archmax.example.com";

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await import("./env.js");
    await mod.validateEnvOrSleep();

    const output = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).not.toContain("APP_BASE_URL is not set");
    spy.mockRestore();
  });
});
