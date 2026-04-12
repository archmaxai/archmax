import { test, expect } from "@playwright/test";

const USERNAME = process.env.E2E_USERNAME ?? "admin";
const PASSWORD = process.env.E2E_PASSWORD ?? "testpass123";

test.describe("Smoke tests", () => {
  test("health endpoint returns healthy", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(body.checks).toBeDefined();
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator("h1")).toHaveText("archmax");
    await expect(page.locator("#username")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("Authentication", () => {
  test("can log in with valid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#username").fill(USERNAME);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    const disclaimer = page.getByRole("dialog");
    await expect(disclaimer).toBeVisible({ timeout: 5_000 });
    await disclaimer.locator("input[type='checkbox']").check();
    await disclaimer.getByRole("button", { name: "Continue" }).click();
    await expect(disclaimer).not.toBeVisible();
  });

  test("rejects empty password", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#username").fill(USERNAME);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/login/);
  });

  test("rejects correct username with wrong password", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#username").fill(USERNAME);
    await page.locator("#password").fill("wr0ng-p@ssw0rd!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator(".error-banner")).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejects wrong username and wrong password", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#username").fill("nonexistent-user");
    await page.locator("#password").fill("wr0ng-p@ssw0rd!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator(".error-banner")).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
