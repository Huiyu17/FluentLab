import { expect, test } from "@playwright/test";
import { admin, setupLiveUser, signIn } from "./helpers";

// M8 Gap Tracker against the real Supabase project with the mock AI provider: a reviewed
// conversation creates a gap, which is listed, shows its evidence, and can be dismissed and restored.

const liveUser = setupLiveUser();

test("a reviewed conversation's gap appears in the Gap Tracker and can be dismissed and restored", async ({
  page,
}) => {
  await signIn(page, liveUser());
  await page.goto("/gaps");
  await expect(page.getByRole("heading", { name: "No patterns yet" })).toBeVisible();

  // One mock-reviewed conversation: its first learner turn is a 0.9 "Word choice" event.
  await page.goto("/simulator/office-hours");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
  const conversationId = page.url().split("/").at(-1)!;
  await page.getByLabel("Your message").fill("I want ask about the homework.");
  await page.getByLabel("Your message").press("Enter");
  await expect(page.getByRole("list", { name: "Conversation" })).toContainText("Can you tell me a bit more");
  await expect(page.getByRole("button", { name: "End conversation" })).toBeEnabled();
  await page.getByRole("button", { name: "End conversation" }).click();
  await page.getByRole("button", { name: "End and get feedback" }).click();
  await expect(page.getByRole("heading", { name: "How it went" })).toBeVisible();

  // Listed under Focus areas, with its counts.
  await page.goto("/gaps");
  const focus = page.getByRole("region", { name: /Focus areas/ });
  const row = focus.getByRole("link", { name: /Word choice/ });
  await expect(row).toContainText("Low priority");
  await expect(row).toContainText("Seen 1× in 1 conversation");

  // The gap page shows the evidence and links back to the review.
  await row.click();
  await expect(page.getByRole("heading", { level: 1, name: "Word choice" })).toBeVisible();
  await expect(page.getByText("Focus area", { exact: true })).toBeVisible();
  const evidence = page.getByRole("region", { name: "Examples from your conversations" });
  await expect(evidence).toContainText("I want ask about the homework.");
  await expect(evidence).toContainText("More natural");
  await expect(evidence.getByRole("link", { name: "Office Hours" })).toHaveAttribute(
    "href",
    `/conversations/${conversationId}/review`,
  );

  // Dismiss (with a confirm), then restore.
  await page.getByRole("button", { name: "Dismiss" }).click();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByRole("note")).toContainText("Dismissed");
  const { data: dismissed } = await admin!
    .from("language_gaps")
    .select("status")
    .eq("user_id", liveUser().id)
    .single();
  expect(dismissed?.status).toBe("dismissed");

  await page.goto("/gaps");
  await expect(page.getByRole("region", { name: /Focus areas/ })).toHaveCount(0);
  await page.getByText("Dismissed (1)").click();
  await page.getByRole("link", { name: /Word choice/ }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Focus area", { exact: true })).toBeVisible();
  const { data: restored } = await admin!
    .from("language_gaps")
    .select("status")
    .eq("user_id", liveUser().id)
    .single();
  expect(restored?.status).toBe("active");
});
