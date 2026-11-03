import { expect, test } from "@playwright/test";
import { expectNoA11yViolations, expectNoHorizontalOverflow } from "../a11y";
import { admin, setupLiveUser, signIn } from "./helpers";

// M10 Real-Life Debrief against the real Supabase project with the mock AI provider.

const liveUser = setupLiveUser();

test("a debrief is saved, shown, saved from, practiced and deleted", async ({ page }) => {
  await signIn(page, liveUser());
  await page.goto("/debrief");
  await expect(page.getByText(/Nothing yet\. Your debriefs will be listed here/)).toBeVisible();

  await page.getByLabel("What happened?").fill("At the pharmacy I asked if my prescription was ready.");
  await page.getByLabel("What did you say? (optional)").fill("Is my medicine finish?");
  await page.getByRole("button", { name: "Debrief it" }).click();
  await expect(page).toHaveURL(/\/debrief\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").at(-1)!;

  const { data: debrief } = await admin!
    .from("debriefs")
    .select("user_id, situation, what_user_said, result, scenario_id")
    .eq("id", id)
    .single();
  expect(debrief).toMatchObject({
    user_id: liveUser().id,
    situation: "At the pharmacy I asked if my prescription was ready.",
    what_user_said: "Is my medicine finish?",
    scenario_id: null,
  });
  expect(debrief?.result).toMatchObject({ model: "mock/debrief-v1" });

  // The result page: phrasings by register, why, and the sample notice (mock AI).
  await expect(
    page.getByRole("heading", { level: 1, name: /Sample debrief: At the pharmacy/ }),
  ).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Sample debrief");
  for (const register of ["Casual", "Neutral", "Formal"]) {
    await expect(page.getByRole("region", { name: new RegExp(`^${register}`) })).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Why" })).toBeVisible();
  await expectNoA11yViolations(page, "debrief result");
  await expectNoHorizontalOverflow(page, "debrief result");

  // Save an expression; the saved state comes from the server and survives a reload.
  await page.getByRole("button", { name: "Add to My English: Sorry to bother you, …" }).click();
  const saved = page.getByRole("link", { name: "In My English: Sorry to bother you, …" });
  await expect(saved).toBeVisible();
  await page.reload();
  await expect(saved).toBeVisible();
  const { data: item } = await admin!
    .from("learning_items")
    .select("id, source, source_debrief_id, example")
    .eq("user_id", liveUser().id)
    .eq("expression", "Sorry to bother you, …")
    .single();
  expect(item).toMatchObject({ source: "debrief", source_debrief_id: id });
  await saved.click();
  await page.getByRole("link", { name: "Saved from a real-life debrief" }).click();
  await expect(page).toHaveURL(`/debrief/${id}`);

  await page.goto("/debrief");
  await expect(
    page.getByRole("link", { name: /At the pharmacy I asked if my prescription was ready\./ }),
  ).toHaveAttribute("href", `/debrief/${id}`);

  // Practice this situation: creates the learner's own scenario once and opens its brief.
  await page.goto(`/debrief/${id}`);
  await expect(page.getByRole("region", { name: "Practice it" })).toContainText(
    "The other person in that situation",
  );
  await page.getByRole("button", { name: "Practice this situation" }).click();
  await expect(page).toHaveURL(/\/simulator\/custom\/[0-9a-f-]{36}$/);
  const scenarioUrl = page.url();
  await expect(page.getByRole("heading", { level: 1, name: /Practice: At the pharmacy/ })).toBeVisible();
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("list", { name: "Conversation" })).toContainText("Hi, what can I do for you?");

  // Back on the debrief: it links to the same scenario, and only one was created.
  await page.goto(`/debrief/${id}`);
  await page.getByRole("link", { name: "Open your practice scenario" }).click();
  await expect(page).toHaveURL(scenarioUrl);
  const { data: scenarios } = await admin!
    .from("scenarios")
    .select("id")
    .eq("created_by", liveUser().id)
    .eq("is_custom", true);
  expect(scenarios).toHaveLength(1);

  // Deleting the scenario clears the link, so the debrief offers to create one again.
  await admin!.from("scenarios").delete().eq("id", scenarios![0]!.id);
  await page.goto(`/debrief/${id}`);
  await expect(page.getByRole("button", { name: "Practice this situation" })).toBeVisible();

  // Delete it: the list is empty again, and the saved expression stays (its link is cleared).
  await page.goto(`/debrief/${id}`);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/debrief$/);
  await expect(page.getByText(/Nothing yet\. Your debriefs will be listed here/)).toBeVisible();
  const { data: kept } = await admin!
    .from("learning_items")
    .select("source_debrief_id")
    .eq("id", item!.id)
    .single();
  expect(kept).toEqual({ source_debrief_id: null });
});
