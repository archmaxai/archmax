import { test, expect } from "@playwright/test";

const USERNAME = process.env.E2E_USERNAME ?? "admin";
const PASSWORD = process.env.E2E_PASSWORD ?? "testpass123";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";

test.describe("REST API session protection", () => {
  const PROTECTED_ENDPOINT = "/api/projects";

  test("rejects request with no session cookie", async ({ request }) => {
    const res = await request.get(PROTECTED_ENDPOINT);
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("rejects request with forged session cookie", async ({ request }) => {
    const res = await request.get(PROTECTED_ENDPOINT, {
      headers: {
        Cookie: [
          "archmax.session_token=forged-invalid-session-token",
          "archmax.session_data=eyJmYWtlIjp0cnVlfQ",
        ].join("; "),
      },
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("allows request with valid session", async ({ request }) => {
    const signIn = await request.post("/api/auth/sign-in/username", {
      data: { username: USERNAME, password: PASSWORD },
    });
    expect(signIn.ok()).toBeTruthy();

    const res = await request.get(PROTECTED_ENDPOINT);
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBeTruthy();
  });

  test("session is invalidated after sign-out", async ({ request }) => {
    const signIn = await request.post("/api/auth/sign-in/username", {
      data: { username: USERNAME, password: PASSWORD },
    });
    expect(signIn.ok()).toBeTruthy();

    const before = await request.get(PROTECTED_ENDPOINT);
    expect(before.status()).toBe(200);

    const signOut = await request.post("/api/auth/sign-out", {
      headers: { Origin: BASE_URL },
      data: {},
    });
    expect(signOut.ok()).toBeTruthy();

    const after = await request.get(PROTECTED_ENDPOINT);
    expect(after.status()).toBe(401);
  });
});

test.describe("Public endpoints require no authentication", () => {
  test("GET /api/health is accessible without session", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
  });

  test("GET /api/config is accessible without session", async ({ request }) => {
    const res = await request.get("/api/config");
    expect(res.status()).toBe(200);
  });
});

test.describe("MCP Bearer token protection", () => {
  const MCP_ENDPOINT = "/mcp/nonexistent-slug/mcp";
  const JSON_RPC_BODY = {
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "e2e-test", version: "1.0.0" },
    },
    id: 1,
  };

  function expectJsonRpcUnauthorized(body: unknown) {
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32001,
        message: "Invalid or missing authorization",
      },
    });
  }

  test("rejects request with no Authorization header", async ({ request }) => {
    const res = await request.post(MCP_ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: JSON_RPC_BODY,
    });
    expect(res.status()).toBe(401);
    expectJsonRpcUnauthorized(await res.json());
  });

  test("rejects request with invalid Bearer token", async ({ request }) => {
    const res = await request.post(MCP_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid-garbage-token-12345",
      },
      data: JSON_RPC_BODY,
    });
    expect(res.status()).toBe(401);
    expectJsonRpcUnauthorized(await res.json());
  });

  test("rejects request with non-Bearer auth scheme", async ({ request }) => {
    const res = await request.post(MCP_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic dXNlcjpwYXNz",
      },
      data: JSON_RPC_BODY,
    });
    expect(res.status()).toBe(401);
    expectJsonRpcUnauthorized(await res.json());
  });
});
