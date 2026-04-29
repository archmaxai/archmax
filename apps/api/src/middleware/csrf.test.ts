import { describe, it, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { csrfMiddleware } from "./csrf";

beforeAll(() => {
  process.env.APP_BASE_URL = "https://archmax.example.com";
  process.env.CORS_ORIGINS = "http://localhost:5173,https://app.example.com";
  process.env.MONGODB_URI = "mongodb://localhost:27017/test";
  process.env.BETTER_AUTH_SECRET = "test-secret-with-at-least-32-chars-long";
  process.env.UI_PASSWORD = "test-password";
});

function buildApp() {
  const app = new Hono();
  app.use("/api/*", csrfMiddleware);
  app.post("/api/projects/x/mcp-tokens", (c) => c.json({ ok: true }));
  app.delete("/api/projects/x/mcp-tokens/y", (c) => c.json({ ok: true }));
  app.get("/api/projects/x/mcp-tokens", (c) => c.json({ ok: true }));
  app.post("/api/auth/sign-in/email", (c) => c.json({ ok: true }));
  return app;
}

describe("csrfMiddleware", () => {
  it("allows GET without Origin", async () => {
    const app = buildApp();
    const res = await app.request("/api/projects/x/mcp-tokens");
    expect(res.status).toBe(200);
  });

  it("rejects POST when both Origin and Referer are absent", async () => {
    const app = buildApp();
    const res = await app.request("/api/projects/x/mcp-tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/missing Origin/i);
  });

  it("rejects DELETE when both Origin and Referer are absent", async () => {
    const app = buildApp();
    const res = await app.request("/api/projects/x/mcp-tokens/y", {
      method: "DELETE",
    });
    expect(res.status).toBe(403);
  });

  it("allows POST from trusted Origin", async () => {
    const app = buildApp();
    const res = await app.request("/api/projects/x/mcp-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:5173",
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
  });

  it("rejects POST from foreign Origin", async () => {
    const app = buildApp();
    const res = await app.request("/api/projects/x/mcp-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example.com",
      },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("rejects DELETE from foreign Origin", async () => {
    const app = buildApp();
    const res = await app.request("/api/projects/x/mcp-tokens/y", {
      method: "DELETE",
      headers: { origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(403);
  });

  it("falls back to Referer when Origin is absent", async () => {
    const app = buildApp();

    const ok = await app.request("/api/projects/x/mcp-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        referer: "http://localhost:5173/some/page",
      },
      body: "{}",
    });
    expect(ok.status).toBe(200);

    const bad = await app.request("/api/projects/x/mcp-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        referer: "https://evil.example.com/page",
      },
      body: "{}",
    });
    expect(bad.status).toBe(403);
  });

  it("skips /api/auth/* (Better Auth handles its own CSRF)", async () => {
    const app = buildApp();
    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example.com",
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
  });

  it("rejects malformed Origin header", async () => {
    const app = buildApp();
    const res = await app.request("/api/projects/x/mcp-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "not a url",
      },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("allows POST from APP_BASE_URL even when CORS_ORIGINS is explicit", async () => {
    const app = buildApp();
    const res = await app.request("/api/projects/x/mcp-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://archmax.example.com",
      },
      body: "{}",
    });
    expect(res.status).toBe(200);
  });

  it("rejects foreign Origin even when proxy headers match it", async () => {
    const app = buildApp();
    const res = await app.request("/api/projects/x/mcp-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example.com",
        "x-forwarded-host": "archmax.example.com",
        "x-forwarded-proto": "https",
      },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });
});
