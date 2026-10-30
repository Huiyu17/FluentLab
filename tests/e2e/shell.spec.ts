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

  test("Today explains that the daily plan needs an account", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your daily plan needs an account" })).toBeVisible();
  });

  test("Expression Studio explains with the mock provider and says it's a sample", async ({ page }) => {
    await page.goto("/expressions");
    await page.getByLabel("Look up a phrase or expression").fill("touch base");
    await page.getByRole("button", { name: "Explain" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "touch base" })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("AI isn't connected yet");
    await expect(page.getByRole("button", { name: "Add to My English" })).toBeDisabled();
  });

  test("Studio rejects empty input", async ({ page }) => {
    await page.goto("/vocabulary");
    await page.getByRole("button", { name: "Explain" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Type a word or phrase." })).toBeVisible();
  });

  test("My English explains that saved items need an account", async ({ page }) => {
    await page.goto("/my-english?type=word&status=due");
    await expect(page.getByRole("heading", { level: 1, name: "My English" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My English needs an account" })).toBeVisible();
  });

  test("Simulator explains that scenarios need an account and offers to create one", async ({ page }) => {
    await page.goto("/simulator");
    await expect(page.getByRole("heading", { name: "Scenarios need an account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create your own" })).toHaveAttribute(
      "href",
      "/simulator/custom",
    );
  });

  test("a scenario brief explains that it needs an account", async ({ page }) => {
    await page.goto("/simulator/office-hours");
    await expect(page.getByRole("heading", { name: "Scenarios need an account" })).toBeVisible();
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

  test("dynamic routes explain that they need an account", async ({ page }) => {
    await page.goto("/conversations/00000000-0000-4000-8000-000000000001/review");
    await expect(page.getByRole("heading", { name: "Reviews need an account" })).toBeVisible();
  });

  test("unknown routes show the 404 page", async ({ page }) => {
    const res = await page.goto("/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Back to Today" })).toBeVisible();
  });
});
