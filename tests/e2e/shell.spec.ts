import { expect, test } from "@playwright/test";

test.describe("app shell (unconfigured mode)", () => {
  test("landing page links into the app", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Sound natural");
    await page.getByRole("link", { name: "Look around" }).click();
    await expect(page).toHaveURL(/\/today$/);
  });

  test("shows the Supabase setup notice", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByRole("status").filter({ hasText: "Supabase is not configured" })).toBeVisible();
  });

  test("sidebar navigates between sections and marks the current page", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop sidebar");
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "Gap Tracker" }).click();
    await expect(page).toHaveURL(/\/gaps$/);
    await expect(page.getByRole("heading", { level: 1, name: "Gap Tracker" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Gap Tracker" })).toHaveAttribute("aria-current", "page");
  });

  test("mobile menu opens, navigates and closes", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile sheet");
    await page.goto("/today");
    await page.getByRole("button", { name: "Open navigation" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("link", { name: "Real-Life Simulator" }).click();
    await expect(page).toHaveURL(/\/simulator$/);
    await expect(dialog).toBeHidden();
  });

  test("dynamic placeholder routes render", async ({ page }) => {
    await page.goto("/conversations/00000000-0000-4000-8000-000000000001/review");
    await expect(page.getByRole("heading", { level: 1, name: "Conversation Review" })).toBeVisible();
  });

  test("unknown routes show the 404 page", async ({ page }) => {
    const res = await page.goto("/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Back to Today" })).toBeVisible();
  });
});
