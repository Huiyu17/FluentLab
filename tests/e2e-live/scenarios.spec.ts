import { expect, test } from "@playwright/test";
import { admin, signIn, useLiveUser } from "./helpers";

// M5 custom scenario lifecycle against the real Supabase project. Run with `npm run test:e2e:live`.

const liveUser = useLiveUser();

test("a custom scenario can be created, edited, found in the catalog and deleted", async ({ page }) => {
  await signIn(page, liveUser());
  await page.goto("/simulator");
  await page.getByRole("link", { name: "Create your own" }).click();
  await expect(page).toHaveURL(/\/simulator\/custom$/);

  // Empty submit: client-side errors on every required field, nothing saved.
  await page.getByRole("button", { name: "Create scenario" }).click();
  await expect(page.getByText("Give your scenario a short title.")).toBeVisible();
  await expect(page.getByText("Describe who you are in this situation.")).toBeVisible();
  await expect(page.getByText("Describe who you'll be talking to.")).toBeVisible();
  await expect(page.getByText("What do you want to get out of the conversation?")).toBeVisible();

  await page.getByLabel("Title").fill("Asking my advisor for an extension");
  await page.getByLabel("Who are you?").fill("A first-year PhD student whose experiment failed");
  await page.getByLabel("Who are you talking to?").fill("My advisor, Dr. Chen");
  await page.getByLabel("Your goal").fill("Ask for one more week without sounding like I'm making excuses.");
  await page
    .locator("label")
    .filter({ hasText: /^Advanced$/ })
    .click();
  await page
    .locator("label")
    .filter({ hasText: /^15 min$/ })
    .click();
  await page.getByRole("button", { name: "Create scenario" }).click();

  await expect(page).toHaveURL(/\/simulator\/custom\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Asking my advisor for an extension" }),
  ).toBeVisible();
  await expect(page.getByText("They'll open the conversation.")).toBeVisible();
  await expect(page.getByText("About 15 min")).toBeVisible();

  // Stored as the learner's own custom scenario.
  const { data: rows } = await admin!
    .from("scenarios")
    .select("category, is_custom, created_by, difficulty, opening_line")
    .eq("created_by", liveUser().id);
  expect(rows).toEqual([
    {
      category: "custom",
      is_custom: true,
      created_by: liveUser().id,
      difficulty: "advanced",
      opening_line: null,
    },
  ]);

  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Title")).toHaveValue("Asking my advisor for an extension");
  await page.getByLabel("Title").fill("Extension request");
  await page.getByLabel("How do they open the conversation?").fill("Hi! What did you want to talk about?");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Extension request" })).toBeVisible();
  await expect(page.getByText(/What did you want to talk about\?/)).toBeVisible();

  await page.getByRole("link", { name: "Real-Life Simulator" }).first().click();
  const yours = page.getByRole("region", { name: "Your scenarios" });
  await expect(yours.getByRole("link", { name: /Extension request/ })).toBeVisible();

  await yours.getByRole("link", { name: /Extension request/ }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete" }).click(); // confirm
  await expect(page).toHaveURL(/\/simulator$/);
  await expect(page.getByRole("heading", { name: "Practice a situation from your own life" })).toBeVisible();
});

// The brief streams inside Suspense, so the 200 status is already sent when notFound() runs;
// Next swaps in the not-found UI (with noindex). Check what the learner sees, not the status.
test("someone else's or a missing scenario shows the not-found page", async ({ page }) => {
  await signIn(page, liveUser());
  for (const path of [
    "/simulator/custom/00000000-0000-4000-8000-000000000000",
    "/simulator/custom/00000000-0000-4000-8000-000000000000/edit",
    "/simulator/custom/not-a-uuid",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "We couldn't find that page" }), path).toBeVisible();
  }
});
