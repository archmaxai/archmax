import { test, expect, type Page, type BrowserContext, type APIRequestContext } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";
const USERNAME = process.env.E2E_USERNAME ?? "admin";
const PASSWORD = process.env.E2E_PASSWORD ?? "testpass123";

const PROJECT_NAME = "E2E CSV Test";
const CSV_FIXTURE = path.join(__dirname, "../fixtures/csv/products.csv");
const CSV_FILENAME = "products.csv";
const CONNECTION_NAME = "E2E CSV Products";
const CONNECTION_SLUG = "e2e_csv_products";

const AUTH_FILE = path.join(__dirname, ".csv-auth-state.json");

function apiHeaders(cookie: string) {
  return { Cookie: cookie, "Content-Type": "application/json" };
}

async function getSessionCookie(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies();
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

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

test.describe.serial("CSV Data Source", () => {
  let projectId: string;
  let cookie: string;
  let connectionId: string;

  test("login and create project", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginAndSaveState(page, context);
    projectId = await ensureProject(page);
    cookie = await getSessionCookie(context);
    expect(projectId).toBeTruthy();

    await context.close();
  });

  test("upload CSV fixture via API", async ({ request }) => {
    const fileBuffer = fs.readFileSync(CSV_FIXTURE);
    const res = await request.post(
      `${BASE_URL}/api/projects/${projectId}/documents/upload`,
      {
        headers: { Cookie: cookie },
        multipart: {
          file: {
            name: CSV_FILENAME,
            mimeType: "text/csv",
            buffer: fileBuffer,
          },
        },
      },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.filename).toBe(CSV_FILENAME);
  });

  test("create CSV connection via API", async ({ request }) => {
    const res = await request.post(
      `${BASE_URL}/api/projects/${projectId}/connections`,
      {
        headers: apiHeaders(cookie),
        data: {
          name: CONNECTION_NAME,
          slug: CONNECTION_SLUG,
          type: "csv",
          connectionConfig: { filename: CSV_FILENAME },
        },
      },
    );
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.type).toBe("csv");
    expect(body.slug).toBe(CONNECTION_SLUG);
    connectionId = body._id;
  });

  test("test CSV connection", async ({ request }) => {
    const res = await request.post(
      `${BASE_URL}/api/projects/${projectId}/connections/${connectionId}/test`,
      { headers: apiHeaders(cookie), data: {} },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("query CSV data through data-browser API", async ({ request }) => {
    const dbRes = await request.get(
      `${BASE_URL}/api/projects/${projectId}/data-browser/databases`,
      { headers: apiHeaders(cookie) },
    );
    expect(dbRes.status()).toBe(200);
    const databases: Array<{ name: string }> = await dbRes.json();
    const csvDb = databases.find((d) => d.name === CONNECTION_SLUG);
    expect(csvDb).toBeTruthy();

    const tablesRes = await request.get(
      `${BASE_URL}/api/projects/${projectId}/data-browser/databases/${CONNECTION_SLUG}/tables`,
      { headers: apiHeaders(cookie) },
    );
    expect(tablesRes.status()).toBe(200);
    const tables: Array<{ schema: string; name: string }> = await tablesRes.json();
    const csvTable = tables.find((t) => t.name === "products");
    expect(csvTable).toBeTruthy();

    const dataRes = await request.get(
      `${BASE_URL}/api/projects/${projectId}/data-browser/databases/${CONNECTION_SLUG}/tables/${csvTable!.schema}/${csvTable!.name}/data?page=1&pageSize=20`,
      { headers: apiHeaders(cookie) },
    );
    expect(dataRes.status()).toBe(200);
    const data = await dataRes.json();
    expect(data.rows.length).toBe(10);
  });

  test("CSV connection appears in UI connections list", async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    await page.goto(`/${projectId}/connections`);
    await page.waitForLoadState("networkidle");

    const row = page.getByRole("row").filter({ hasText: CONNECTION_NAME });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText("csv")).toBeVisible();

    await context.close();
  });

  test.afterAll(() => {
    if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
  });
});
