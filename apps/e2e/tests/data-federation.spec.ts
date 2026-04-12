import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERNAME = process.env.E2E_USERNAME ?? "admin";
const PASSWORD = process.env.E2E_PASSWORD ?? "testpass123";

const PROJECT_NAME = "E2E Federation";

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
] as const;

const AUTH_FILE = path.join(__dirname, ".auth-state.json");

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

  const url = page.url();
  const projectMatch = url.match(/\/([a-f0-9]{24})\//);
  if (projectMatch) return projectMatch[1];

  await page.getByRole("button", { name: "Select a project" }).click();
  await page.getByRole("menuitem", { name: "New Project" }).click();
  await page.getByLabel("Title").fill(PROJECT_NAME);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/[a-f0-9]{24}\//, { timeout: 10_000 });
  const newUrl = page.url();
  return newUrl.match(/\/([a-f0-9]{24})\//)![1];
}

async function createConnection(
  page: Page,
  projectId: string,
  conn: (typeof CONNECTIONS)[number],
) {
  await page.goto(`/${projectId}/connections`);
  await page.waitForLoadState("networkidle");

  const existingRow = page.getByRole("row").filter({ hasText: conn.name });
  if (await existingRow.count() > 0) return;

  await page.getByRole("button", { name: "New Connection" }).click();

  await page.locator("#conn-name").fill(conn.name);

  const typeSelect = page.locator("[data-slot='select-trigger']").first();
  await typeSelect.click();
  await page.getByRole("option", { name: conn.type, exact: true }).click();

  if (conn.type === "sqlite") {
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

async function testConnection(page: Page, projectId: string, connName: string) {
  await page.goto(`/${projectId}/connections`);
  await page.waitForLoadState("networkidle");

  const row = page.getByRole("row").filter({ hasText: connName });
  await row.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Edit" }).click();

  const testBtn = page.getByRole("button", { name: "Test Connection" });
  await testBtn.waitFor({ state: "visible" });

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/test") && r.request().method() === "POST"),
    testBtn.click(),
  ]);
  expect(response.status()).toBe(200);

  await expect(page.getByText("Connection is healthy")).toBeVisible({ timeout: 10_000 });
}

test.describe.serial("Data Federation", () => {
  let projectId: string;

  test("login and ensure project exists", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginAndSaveState(page, context);
    projectId = await ensureProject(page);
    expect(projectId).toBeTruthy();

    await context.close();
  });

  for (const conn of CONNECTIONS) {
    test(`create ${conn.type} connection`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: AUTH_FILE });
      const page = await context.newPage();

      await createConnection(page, projectId, conn);

      await context.close();
    });
  }

  for (const conn of CONNECTIONS) {
    test(`test ${conn.type} connection`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: AUTH_FILE });
      const page = await context.newPage();

      await testConnection(page, projectId, conn.name);

      await context.close();
    });
  }

  test.afterAll(() => {
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  });
});
