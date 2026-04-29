import { test, expect, type Page, type BrowserContext, type APIRequestContext, type APIResponse } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";
const USERNAME = process.env.E2E_USERNAME ?? "admin";
const PASSWORD = process.env.E2E_PASSWORD ?? "testpass123";

const PROJECT_NAME = "E2E Federation";
const MODEL_NAME = "e2e_federation";
const TOKEN_NAME = "E2E MCP Test Token";

const CONNECTIONS = [
  {
    name: "E2E Postgres",
    type: "postgres",
    config: { host: "postgres", port: "5432", database: "e2e_test", user: "e2e", password: "e2e_pass" },
  },
  {
    name: "E2E MySQL",
    type: "mysql",
    config: { host: "mysql", port: "3306", database: "e2e_test", user: "e2e", password: "e2e_pass" },
  },
  {
    name: "E2E MSSQL",
    type: "mssql",
    config: { host: "mssql", port: "1433", database: "e2e_test", user: "sa", password: "E2e_Str0ng!Pass", encrypt: false },
  },
  {
    name: "E2E SQLite",
    type: "sqlite",
    config: { database: "/e2e-fixtures/e2e.db" },
  },
  {
    name: "E2E Iceberg",
    type: "iceberg",
    config: { endpoint: "http://lakekeeper:8181/catalog", warehouse: "e2e_warehouse", token: "e2e-iceberg-token" },
  },
] as const;

const AUTH_FILE = path.join(__dirname, ".mcp-auth-state.json");

const MCP_ACCEPT = "application/json, text/event-stream";

// ── Helpers ──────────────────────────────────────────────────────────

async function loginAndSaveState(page: Page, context: BrowserContext) {
  await page.goto("/login");
  await page.locator("#username").fill(USERNAME);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

  const disclaimer = page.getByRole("dialog");
  if (await disclaimer.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await disclaimer.locator("input[type='checkbox']").check();
    await disclaimer.getByRole("button", { name: "Continue" }).click();
  }

  await context.storageState({ path: AUTH_FILE });
}

async function ensureProject(page: Page): Promise<string> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  const url = page.url();
  const projectMatch = url.match(/\/([a-f0-9]{24})(?:\/|$)/);
  if (projectMatch) return projectMatch[1];

  await page.getByRole("button", { name: "Select a project" }).click();
  await page.getByRole("menuitem", { name: "New Project" }).click();
  await page.getByLabel("Title").fill(PROJECT_NAME);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/[a-f0-9]{24}(?:\/|$)/, { timeout: 10_000 });
  const newUrl = page.url();
  return newUrl.match(/\/([a-f0-9]{24})(?:\/|$)/)![1];
}

async function createConnection(
  page: Page,
  projectId: string,
  conn: (typeof CONNECTIONS)[number],
) {
  await page.goto(`/${projectId}/connections`);
  await page.waitForLoadState("networkidle");

  const existingRow = page.getByRole("row").filter({ hasText: conn.name });
  if ((await existingRow.count()) > 0) return;

  await page.getByRole("button", { name: "New Connection" }).click();
  await page.locator("#conn-name").fill(conn.name);

  const typeSelect = page.locator("[data-slot='select-trigger']").first();
  await typeSelect.click();
  await page.getByRole("option", { name: conn.type, exact: true }).click();

  if (conn.type === "iceberg") {
    await page.locator("#conn-endpoint").fill(conn.config.endpoint);
    await page.locator("#conn-warehouse").fill(conn.config.warehouse);
    await page.locator("#conn-token").fill(conn.config.token);
  } else if (conn.type === "sqlite") {
    await page.locator("#conn-db").fill(conn.config.database);
  } else {
    await page.locator("#conn-host").fill(conn.config.host);
    await page.locator("#conn-port").fill(conn.config.port);
    await page.locator("#conn-db").fill(conn.config.database);
    await page.locator("#conn-user").fill(conn.config.user);
    await page.locator("#conn-pass").fill(conn.config.password);

    if (conn.type === "mssql") {
      const encryptSwitch = page.locator("#conn-encrypt");
      const isChecked = await encryptSwitch.isChecked();
      if (isChecked) await encryptSwitch.click();
    }
  }

  await page.getByRole("button", { name: "Create" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: conn.name }),
  ).toBeVisible({ timeout: 15_000 });
}

function apiHeaders(cookie: string) {
  return { Cookie: cookie, "Content-Type": "application/json" };
}

async function getSessionCookie(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies();
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

interface ConnectionInfo { slug: string; name: string; type: string }

async function getConnections(request: APIRequestContext, projectId: string, cookie: string): Promise<ConnectionInfo[]> {
  const res = await request.get(`${BASE_URL}/api/projects/${projectId}/connections`, {
    headers: apiHeaders(cookie),
  });
  expect(res.status()).toBe(200);
  return res.json();
}

async function getProjectSlug(request: APIRequestContext, projectId: string, cookie: string): Promise<string> {
  const res = await request.get(`${BASE_URL}/api/projects/${projectId}`, {
    headers: apiHeaders(cookie),
  });
  expect(res.status()).toBe(200);
  const project = await res.json();
  return project.slug || projectId;
}

function buildSemanticModel(connections: ConnectionInfo[]) {
  const pgSlug = connections.find((c) => c.type === "postgres")!.slug;
  const mySlug = connections.find((c) => c.type === "mysql")!.slug;
  const msSlug = connections.find((c) => c.type === "mssql")!.slug;
  const iceSlug = connections.find((c) => c.type === "iceberg")!.slug;

  return {
    name: MODEL_NAME,
    description: "E2E test model spanning Postgres, MySQL, MSSQL, and Iceberg",
    datasets: [
      {
        name: "products",
        source: `${pgSlug}.public.e2e_products`,
        primary_key: ["id"],
        fields: [
          { name: "id", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "id" }] } },
          { name: "name", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "name" }] } },
          { name: "price", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "price" }] } },
        ],
      },
      {
        name: "orders",
        source: `${mySlug}.e2e_test.e2e_orders`,
        primary_key: ["id"],
        fields: [
          { name: "id", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "id" }] } },
          { name: "product_name", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "product_name" }] } },
          { name: "quantity", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "quantity" }] } },
        ],
      },
      {
        name: "customers",
        source: `${msSlug}.dbo.e2e_customers`,
        primary_key: ["id"],
        fields: [
          { name: "id", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "id" }] } },
          { name: "name", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "name" }] } },
          { name: "email", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "email" }] } },
        ],
      },
      {
        name: "shipments",
        source: `${iceSlug}.e2e_test.e2e_shipments`,
        primary_key: ["id"],
        fields: [
          { name: "id", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "id" }] } },
          { name: "product_name", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "product_name" }] } },
          { name: "shipped_date", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "shipped_date" }] } },
          { name: "destination", expression: { dialects: [{ dialect: "ANSI_SQL", expression: "destination" }] } },
        ],
      },
    ],
    relationships: [],
    metrics: [],
  };
}

/**
 * Parse the first JSON-RPC response from an SSE (text/event-stream) or JSON response.
 */
async function parseMcpResponse(res: APIResponse): Promise<Record<string, unknown>> {
  const text = await res.text();
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      const json = line.slice(6).trim();
      if (json) return JSON.parse(json);
    }
  }
  return JSON.parse(text);
}

function mcpEndpoint(slug: string): string {
  return `${BASE_URL}/mcp/${slug}/mcp`;
}

/**
 * Send a raw POST to the MCP endpoint (used for auth-only tests where no session exists).
 */
async function mcpPost(
  request: APIRequestContext,
  slug: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<APIResponse> {
  return request.post(mcpEndpoint(slug), {
    headers: { "Content-Type": "application/json", Accept: MCP_ACCEPT, ...extraHeaders },
    data: body,
  });
}

/**
 * Initialize an MCP session. Returns the session ID from the response header.
 */
async function mcpInitialize(
  request: APIRequestContext,
  slug: string,
  token: string,
): Promise<{ sessionId: string; response: Record<string, unknown> }> {
  const res = await mcpPost(request, slug, {
    jsonrpc: "2.0",
    method: "initialize",
    id: 1,
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "e2e-test", version: "1.0.0" },
    },
  }, { Authorization: `Bearer ${token}` });

  expect(res.status()).toBe(200);
  const sessionId = res.headers()["mcp-session-id"];
  expect(sessionId).toBeTruthy();

  const response = await parseMcpResponse(res);

  await mcpPost(request, slug, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }, {
    Authorization: `Bearer ${token}`,
    "mcp-session-id": sessionId,
  });

  return { sessionId, response };
}

/**
 * Call an MCP tool within an existing session. Returns the parsed JSON-RPC response.
 */
async function mcpToolCall(
  request: APIRequestContext,
  slug: string,
  sessionId: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await mcpPost(request, slug, {
    jsonrpc: "2.0",
    method: "tools/call",
    id: Date.now(),
    params: { name: toolName, arguments: args },
  }, { "mcp-session-id": sessionId });

  expect(res.status()).toBe(200);
  return parseMcpResponse(res);
}

// ── Test suite ───────────────────────────────────────────────────────

test.describe.serial("MCP Layer", () => {
  let projectId: string;
  let projectSlug: string;
  let mcpToken: string;
  let sessionCookie: string;
  let mcpSessionId: string;

  // ── Setup: login, project, connections ──────────────────────────

  test("login and ensure project exists", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginAndSaveState(page, context);
    projectId = await ensureProject(page);
    expect(projectId).toBeTruthy();

    sessionCookie = await getSessionCookie(context);
    await context.close();
  });

  for (const conn of CONNECTIONS) {
    test(`ensure ${conn.type} connection exists`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: AUTH_FILE });
      const page = await context.newPage();
      await createConnection(page, projectId, conn);
      await context.close();
    });
  }

  // ── Create and publish semantic model ──────────────────────────

  test("create semantic model and publish", async ({ browser, request }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    sessionCookie = await getSessionCookie(context);
    projectSlug = await getProjectSlug(request, projectId, sessionCookie);

    const connections = await getConnections(request, projectId, sessionCookie);
    const model = buildSemanticModel(connections);

    const existingRes = await request.get(
      `${BASE_URL}/api/projects/${projectId}/semantic-models/${MODEL_NAME}`,
      { headers: apiHeaders(sessionCookie) },
    );
    if (existingRes.status() === 200) {
      await request.delete(
        `${BASE_URL}/api/projects/${projectId}/semantic-models/${MODEL_NAME}`,
        { headers: apiHeaders(sessionCookie) },
      );
    }

    const createRes = await request.post(
      `${BASE_URL}/api/projects/${projectId}/semantic-models`,
      { headers: apiHeaders(sessionCookie), data: model },
    );
    expect(createRes.status()).toBe(201);

    const publishRes = await request.post(
      `${BASE_URL}/api/projects/${projectId}/publish`,
      { headers: apiHeaders(sessionCookie), data: { message: "E2E MCP test publish" } },
    );
    expect(publishRes.status()).toBe(201);

    await context.close();
  });

  // ── Auth tests: pre-token ──────────────────────────────────────

  test("MCP request with no token returns 401", async ({ request }) => {
    const res = await mcpPost(request, projectSlug, {
      jsonrpc: "2.0", method: "initialize", id: 1,
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "e2e", version: "1.0" } },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Invalid or missing authorization");
  });

  test("MCP request with invalid token returns 401", async ({ request }) => {
    const res = await mcpPost(request, projectSlug, {
      jsonrpc: "2.0", method: "initialize", id: 1,
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "e2e", version: "1.0" } },
    }, { Authorization: "Bearer invalid_garbage_token_value" });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Invalid or missing authorization");
  });

  // ── Token creation via UI ──────────────────────────────────────

  test("create MCP token via UI", async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    await page.goto(`/${projectId}/mcp-access`);
    await page.waitForLoadState("networkidle");

    const existingTokenRow = page.getByRole("row").filter({ hasText: TOKEN_NAME });
    if ((await existingTokenRow.count()) > 0) {
      await existingTokenRow.getByRole("button").click();
      const revokeDialog = page.getByRole("dialog");
      await revokeDialog.getByRole("button", { name: "Revoke" }).click();
      await expect(existingTokenRow).toBeHidden({ timeout: 10_000 });
    }

    await page.getByRole("button", { name: "Create Token" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Create MCP Token")).toBeVisible({ timeout: 5_000 });

    await dialog.locator("#token-name").fill(TOKEN_NAME);

    const scopeTrigger = dialog.getByRole("button", { name: "Select models..." });
    await scopeTrigger.click();

    const popover = page.locator("[data-radix-popper-content-wrapper]");
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await popover.getByRole("button", { name: MODEL_NAME }).click();

    await page.keyboard.press("Escape");

    const createBtn = dialog.getByRole("button", { name: "Create Token", exact: true });
    await expect(createBtn).toBeEnabled({ timeout: 5_000 });
    await createBtn.click();

    const revealTitle = page.getByText("Token Created");
    await expect(revealTitle).toBeVisible({ timeout: 10_000 });

    const codeEl = page.locator("code.select-all");
    await expect(codeEl).toBeVisible();
    const rawToken = (await codeEl.textContent())?.trim();
    expect(rawToken).toBeTruthy();
    expect(rawToken!).toMatch(/^sml_/);
    mcpToken = rawToken!;

    await page.keyboard.press("Escape");

    await expect(page.getByRole("row").filter({ hasText: TOKEN_NAME })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("row").filter({ hasText: TOKEN_NAME }).getByText(MODEL_NAME)).toBeVisible();

    await context.close();
  });

  // ── Auth test: valid token + session init ──────────────────────

  test("MCP initialize with valid token succeeds", async ({ request }) => {
    const { sessionId, response } = await mcpInitialize(request, projectSlug, mcpToken);
    mcpSessionId = sessionId;

    const result = response as { result?: { serverInfo?: { name: string } } };
    expect(result.result?.serverInfo?.name).toBe("archmax");
  });

  // ── MCP tool tests ─────────────────────────────────────────────

  test("list_semantic_models returns e2e_federation", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "list_semantic_models");
    const text: string = (body as any).result?.content?.[0]?.text ?? "";
    expect(text).toContain(MODEL_NAME);
  });

  test("get_semantic_model returns model overview", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "get_semantic_model", {
      modelName: MODEL_NAME,
    });
    const text: string = (body as any).result?.content?.[0]?.text ?? "";
    expect(text).toContain("products");
    expect(text).toContain("orders");
    expect(text).toContain("customers");
    expect(text).toContain("shipments");
  });

  test("get_datasets returns field details", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "get_datasets", {
      modelName: MODEL_NAME,
      datasets: [
        { name: "products", page: 1 },
        { name: "orders", page: 1 },
        { name: "customers", page: 1 },
        { name: "shipments", page: 1 },
      ],
    });
    const text: string = (body as any).result?.content?.[0]?.text ?? "";
    expect(text).toContain("price");
    expect(text).toContain("product_name");
    expect(text).toContain("email");
    expect(text).toContain("destination");
  });

  test("execute_query returns data from Postgres", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "execute_query", {
      modelName: MODEL_NAME,
      sql: `SELECT * FROM "products" ORDER BY id LIMIT 10`,
    });
    expect((body as any).result?.isError).toBeFalsy();
    const text: string = (body as any).result?.content?.[0]?.text ?? "";
    expect(text).toContain("Widget A");
  });

  test("execute_query cross-database join (Postgres + MySQL)", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "execute_query", {
      modelName: MODEL_NAME,
      sql: [
        `SELECT p.name AS product, o.quantity`,
        `FROM "products" p`,
        `JOIN "orders" o ON p.name = o.product_name`,
        `ORDER BY p.name LIMIT 10`,
      ].join(" "),
    });
    expect((body as any).result?.isError).toBeFalsy();
    const text: string = (body as any).result?.content?.[0]?.text ?? "";
    expect(text).toContain("Widget A");
  });

  test("execute_query returns data from Iceberg", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "execute_query", {
      modelName: MODEL_NAME,
      sql: `SELECT * FROM "shipments" ORDER BY id LIMIT 10`,
    });
    expect((body as any).result?.isError).toBeFalsy();
    const text: string = (body as any).result?.content?.[0]?.text ?? "";
    expect(text).toContain("Widget A");
    expect(text).toContain("New York");
  });

  test("execute_query cross-catalog join (Postgres + Iceberg)", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "execute_query", {
      modelName: MODEL_NAME,
      sql: [
        `SELECT p.name AS product, s.destination`,
        `FROM "products" p`,
        `JOIN "shipments" s ON p.name = s.product_name`,
        `ORDER BY p.name LIMIT 10`,
      ].join(" "),
    });
    expect((body as any).result?.isError).toBeFalsy();
    const text: string = (body as any).result?.content?.[0]?.text ?? "";
    expect(text).toContain("Widget A");
    expect(text).toContain("New York");
  });

  test("execute_query returns storedQueryId when store is true", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "execute_query", {
      modelName: MODEL_NAME,
      sql: `SELECT * FROM "products" WHERE name = $1 ORDER BY id LIMIT 5`,
      params: ["Widget A"],
      store: true,
    });
    expect((body as any).result?.isError).toBeFalsy();
    const text: string = (body as any).result?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text);
    expect(parsed.storedQueryId).toBeTruthy();
    expect(typeof parsed.storedQueryId).toBe("string");
  });

  test("execute_query omits storedQueryId when store is false", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "execute_query", {
      modelName: MODEL_NAME,
      sql: `SELECT * FROM "products" ORDER BY id LIMIT 1`,
      store: false,
    });
    expect((body as any).result?.isError).toBeFalsy();
    const text: string = (body as any).result?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text);
    expect(parsed.storedQueryId).toBeUndefined();
  });

  test("execute_stored_query re-runs a stored query", async ({ request }) => {
    const storeBody = await mcpToolCall(request, projectSlug, mcpSessionId, "execute_query", {
      modelName: MODEL_NAME,
      sql: `SELECT * FROM "products" WHERE name = $1 ORDER BY id LIMIT 5`,
      params: ["Widget A"],
      store: true,
    });
    const storeText: string = (storeBody as any).result?.content?.[0]?.text ?? "";
    const { storedQueryId } = JSON.parse(storeText);
    expect(storedQueryId).toBeTruthy();

    const rerunBody = await mcpToolCall(request, projectSlug, mcpSessionId, "execute_stored_query", {
      storedQueryId,
    });
    expect((rerunBody as any).result?.isError).toBeFalsy();
    const rerunText: string = (rerunBody as any).result?.content?.[0]?.text ?? "";
    expect(rerunText).toContain("Widget A");
  });

  test("execute_stored_query with overridden params", async ({ request }) => {
    const storeBody = await mcpToolCall(request, projectSlug, mcpSessionId, "execute_query", {
      modelName: MODEL_NAME,
      sql: `SELECT name FROM "products" WHERE name = $1 LIMIT 5`,
      params: ["Widget A"],
      store: true,
    });
    const storeText: string = (storeBody as any).result?.content?.[0]?.text ?? "";
    const { storedQueryId } = JSON.parse(storeText);

    const rerunBody = await mcpToolCall(request, projectSlug, mcpSessionId, "execute_stored_query", {
      storedQueryId,
      params: ["Widget B"],
    });
    expect((rerunBody as any).result?.isError).toBeFalsy();
    const rerunText: string = (rerunBody as any).result?.content?.[0]?.text ?? "";
    expect(rerunText).toContain("Widget B");
    expect(rerunText).not.toContain("Widget A");
  });

  test("execute_stored_query with invalid ID returns error", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "execute_stored_query", {
      storedQueryId: "000000000000000000000000",
    });
    const result = (body as any).result;
    expect(result?.isError).toBe(true);
    const text: string = result?.content?.[0]?.text ?? "";
    expect(text).toContain("Stored query not found");
  });

  test("request_improvement succeeds", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "request_improvement", {
      modelName: MODEL_NAME,
      title: "E2E test improvement",
      description: "This is an automated E2E test improvement request.",
    });
    const text: string = (body as any).result?.content?.[0]?.text ?? "";
    expect(text).toContain("submitted successfully");
  });

  // ── Scope enforcement ──────────────────────────────────────────

  test("scope enforcement: out-of-scope model access denied", async ({ request }) => {
    const body = await mcpToolCall(request, projectSlug, mcpSessionId, "get_semantic_model", {
      modelName: "nonexistent_model_xyz",
    });
    const result = (body as any).result;
    const text: string = result?.content?.[0]?.text ?? "";
    expect(result?.isError === true || text.toLowerCase().includes("denied") || text.toLowerCase().includes("not in")).toBeTruthy();
  });

  test("scope enforcement: narrowly scoped token cannot see main model", async ({ browser, request }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    sessionCookie = await getSessionCookie(context);
    await context.close();

    const dummyModel = {
      name: "e2e_scope_test",
      description: "Dummy model for scope enforcement test",
      datasets: [],
      relationships: [],
      metrics: [],
    };

    await request.post(
      `${BASE_URL}/api/projects/${projectId}/semantic-models`,
      { headers: apiHeaders(sessionCookie), data: dummyModel },
    );

    await request.post(
      `${BASE_URL}/api/projects/${projectId}/publish`,
      { headers: apiHeaders(sessionCookie), data: { message: "Scope test publish" } },
    );

    const tokenRes = await request.post(
      `${BASE_URL}/api/projects/${projectId}/mcp-tokens`,
      {
        headers: apiHeaders(sessionCookie),
        data: { name: "Narrow Scope Token", scopes: ["e2e_scope_test"], expiresAt: null },
      },
    );
    expect(tokenRes.status()).toBe(201);
    const tokenBody = await tokenRes.json();
    const narrowToken: string = tokenBody.token;
    const narrowTokenId: string = tokenBody._id;

    const { sessionId: narrowSession } = await mcpInitialize(request, projectSlug, narrowToken);

    const listBody = await mcpToolCall(request, projectSlug, narrowSession, "list_semantic_models");
    const listText: string = (listBody as any).result?.content?.[0]?.text ?? "";
    expect(listText).not.toContain(MODEL_NAME);
    expect(listText).toContain("e2e_scope_test");

    const getBody = await mcpToolCall(request, projectSlug, narrowSession, "get_semantic_model", {
      modelName: MODEL_NAME,
    });
    const getResult = (getBody as any).result;
    expect(getResult?.isError).toBe(true);

    await request.delete(
      `${BASE_URL}/api/projects/${projectId}/mcp-tokens/${narrowTokenId}`,
      { headers: apiHeaders(sessionCookie) },
    );
    await request.delete(
      `${BASE_URL}/api/projects/${projectId}/semantic-models/e2e_scope_test`,
      { headers: apiHeaders(sessionCookie) },
    );

    await request.post(
      `${BASE_URL}/api/projects/${projectId}/publish`,
      { headers: apiHeaders(sessionCookie), data: { message: "Scope test cleanup publish" } },
    );
  });

  // ── Token activity stats on MCP Access page ────────────────────

  test("token row shows Events (30d) >= 1 and relative Last Used", async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    await page.goto(`/${projectId}/mcp-access`);
    await page.waitForLoadState("networkidle");

    const tokenRow = page.getByRole("row").filter({ hasText: TOKEN_NAME });
    await expect(tokenRow).toBeVisible({ timeout: 5_000 });

    const eventsCell = tokenRow.locator("td").nth(4);
    await expect(eventsCell).toBeVisible();
    const eventsText = (await eventsCell.textContent())?.trim() ?? "";
    const eventsCount = parseInt(eventsText, 10);
    expect(Number.isFinite(eventsCount)).toBe(true);
    expect(eventsCount).toBeGreaterThanOrEqual(1);

    const lastUsedCell = tokenRow.locator("td").nth(3);
    const lastUsedText = (await lastUsedCell.textContent())?.trim() ?? "";
    expect(lastUsedText).not.toBe("—");
    expect(lastUsedText.toLowerCase()).toMatch(/just now|min ago|hr ago|hour|day|sec/);

    await context.close();
  });

  // ── Monitoring page filters ────────────────────────────────────

  test("monitoring page filter by tool narrows the table", async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    await page.goto(`/${projectId}/monitoring`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("row").filter({ hasText: "execute_query" }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("row").filter({ hasText: "get_semantic_model" }).first()).toBeVisible();

    const toolTrigger = page.locator("[data-slot='select-trigger']").first();
    await toolTrigger.click();
    await page.getByRole("option", { name: "execute_query", exact: true }).click();

    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("row").filter({ hasText: "execute_query" }).first()).toBeVisible({ timeout: 10_000 });
    expect(await page.getByRole("row").filter({ hasText: "get_semantic_model" }).count()).toBe(0);

    await context.close();
  });

  test("monitoring page filter by status=Errors only narrows the table", async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    await page.goto(`/${projectId}/monitoring`);
    await page.waitForLoadState("networkidle");

    const statusTrigger = page.locator("[data-slot='select-trigger']").nth(1);
    await statusTrigger.click();
    await page.getByRole("option", { name: "Errors only" }).click();

    await page.waitForLoadState("networkidle");

    const errorBadges = page.getByRole("row").locator("[data-slot='badge']").filter({ hasText: "Error" });
    await expect(errorBadges.first()).toBeVisible({ timeout: 10_000 });

    expect(await page.getByRole("row").locator("[data-slot='badge']").filter({ hasText: "OK" }).count()).toBe(0);

    await context.close();
  });

  // ── Token revocation via UI ────────────────────────────────────

  test("revoke MCP token via UI", async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    await page.goto(`/${projectId}/mcp-access`);
    await page.waitForLoadState("networkidle");

    const tokenRow = page.getByRole("row").filter({ hasText: TOKEN_NAME });
    await expect(tokenRow).toBeVisible({ timeout: 5_000 });

    await tokenRow.getByRole("button").click();

    const revokeDialog = page.getByRole("dialog");
    await expect(revokeDialog.getByText("Revoke Token")).toBeVisible({ timeout: 5_000 });
    await revokeDialog.getByRole("button", { name: "Revoke" }).click();

    await expect(page.getByRole("row").filter({ hasText: TOKEN_NAME })).toBeHidden({ timeout: 10_000 });

    await context.close();
  });

  test("MCP request with revoked token returns 401", async ({ request }) => {
    const res = await mcpPost(request, projectSlug, {
      jsonrpc: "2.0", method: "initialize", id: 1,
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "e2e", version: "1.0" } },
    }, { Authorization: `Bearer ${mcpToken}` });
    expect(res.status()).toBe(401);
  });

  // ── Cleanup ────────────────────────────────────────────────────

  test("cleanup: delete semantic model", async ({ browser, request }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    sessionCookie = await getSessionCookie(context);
    await context.close();

    const res = await request.delete(
      `${BASE_URL}/api/projects/${projectId}/semantic-models/${MODEL_NAME}`,
      { headers: apiHeaders(sessionCookie) },
    );
    expect(res.ok()).toBe(true);
  });

  test.afterAll(() => {
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  });
});
