import { expect, test } from "@playwright/test";
import { expectNoA11yViolations, expectNoHorizontalOverflow } from "../a11y";

// axe (WCAG 2.1 A/AA) on every page in unconfigured mode: the public pages and each sidebar
// section, on desktop and mobile (playwright.config.ts projects). Pages with data are scanned in
// the live suite (tests/e2e-live/golden-path.spec.ts).

const PAGES = [
  "/",
  "/login",
  "/signup",
  "/today",
  "/vocabulary",
  "/expressions",
  "/my-english",
  "/my-english/review",
  "/simulator",
  "/simulator/custom",
  "/conversations",
  "/debrief",
  "/gaps",
  "/profile",
  "/settings",
  "/does-not-exist",
];

for (const path of PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    await expectNoA11yViolations(page, path);
    await expectNoHorizontalOverflow(page, path);
  });
}

test("the first Tab lands on the skip link, which moves focus to the main content", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "keyboard");
  await page.goto("/today");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});
