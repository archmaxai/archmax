import { test, expect } from "@playwright/test";

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

    await page.locator("#username").fill("admin");
    await page.locator("#password").fill("testpass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("shows error with invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#username").fill("wrong");
    await page.locator("#password").fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator(".error-banner")).toBeVisible({ timeout: 5_000 });
  });
});
