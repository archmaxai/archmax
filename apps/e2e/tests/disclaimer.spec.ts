import { test, expect } from "@playwright/test";

const USERNAME = process.env.E2E_USERNAME ?? "admin";
const PASSWORD = process.env.E2E_PASSWORD ?? "testpass123";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator("#username").fill(USERNAME);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
}

test.describe("First-login disclaimer", () => {
  test("shows disclaimer dialog after login", async ({ page }) => {
    await login(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText("Before You Begin")).toBeVisible();
    await expect(dialog.getByText("long-running agents")).toBeVisible();
    await expect(dialog.getByText("source database")).toBeVisible();
    await expect(dialog.getByText("personally identifiable")).toBeVisible();
    await expect(dialog.getByText("reviewed before use")).toBeVisible();
  });

  test("continue button is disabled until checkbox is checked", async ({ page }) => {
    await login(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const continueBtn = dialog.getByRole("button", { name: "Continue" });
    await expect(continueBtn).toBeDisabled();

    await dialog.locator("input[type='checkbox']").check();
    await expect(continueBtn).toBeEnabled();
  });

  test("dismisses disclaimer and does not show again", async ({ page }) => {
    await login(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.locator("input[type='checkbox']").check();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(dialog).not.toBeVisible();

    await page.reload();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 3_000 });
  });
});
