import { expect, test } from "@playwright/test";
import { admin, signIn, useLiveUser } from "./helpers";

// M4 flows against the real Supabase project, as a throwaway onboarded user who is deleted
// afterwards (with all their rows). Run with `npm run test:e2e:live`.

const liveUser = useLiveUser();

test("a saved card that is deleted elsewhere shows 'Add' again on return", async ({ page }) => {
  await signIn(page, liveUser());
  await page.goto("/vocabulary");
  await page.getByLabel("Look up a word").fill("tentative");
  await page.getByRole("button", { name: "Explain" }).click();
  await page.getByRole("button", { name: "Add to My English" }).click();
  await expect(page.getByText("Added to My English")).toBeVisible();

  const saved = page.getByRole("region", { name: /Your saved words/ });
  await expect(saved.getByRole("link", { name: /tentative/ })).toBeVisible();

  await page.getByRole("link", { name: "View saved card" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "tentative" })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete" }).click(); // confirm
  await expect(page).toHaveURL(/\/vocabulary$/);

  // Regression (M4 step 3): the kept page state must not claim the deleted card is saved.
  await expect(page.getByRole("button", { name: "Add to My English" })).toBeVisible();
  await expect(page.getByText("Added to My English")).toBeHidden();
  await expect(page.getByRole("heading", { name: "No saved words yet" })).toBeVisible();
});

test("a curated expression can be added, reviewed and is then no longer due", async ({ page }) => {
  await signIn(page, liveUser());
  await page.goto("/expressions");
  await page.getByRole("button", { name: "Add: Something came up." }).click();
  await expect(page.getByRole("link", { name: "In My English: Something came up." })).toBeVisible();

  await page.goto("/my-english?status=due");
  await expect(page.getByText("Showing 1 of 1")).toBeVisible();
  await page.getByRole("link", { name: /Start review \(1\)/ }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Something came up." })).toBeVisible();
  await page.getByLabel(/Use it in a sentence/).fill("Sorry, something came up, can we move it?");
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(page.getByText("Your sentence:")).toBeVisible();
  await page.keyboard.press("3"); // Good
  await expect(page.getByRole("heading", { name: "Review done" })).toBeVisible();

  // The database moved the schedule: one review log with the sentence mode, next review in a day.
  const { data: logs } = await admin!.from("review_logs").select("rating, mode").eq("user_id", liveUser().id);
  expect(logs).toEqual([{ rating: "good", mode: "use_in_sentence" }]);

  // A fresh visit starts a new session instead of showing the old "done" screen.
  await page.getByRole("region", { name: "Review done" }).getByRole("link", { name: "My English" }).click();
  await expect(page).toHaveURL(/\/my-english$/);
  await page.goto("/my-english/review");
  await expect(page.getByRole("heading", { name: "Nothing to review right now" })).toBeVisible();
  await expect(page.getByText(/Your next review is tomorrow/)).toBeVisible();
});
