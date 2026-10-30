import { expect, test, type Page } from "@playwright/test";
import { admin, setupLiveUser, signIn } from "./helpers";

// M6 conversation flow against the real Supabase project with the mock AI provider
// (playwright.live.config.ts sets AI_PROVIDER=mock), so no AI quota is used.

const liveUser = setupLiveUser();

/** A chat bubble with exactly this text (not the screen-reader live region or its list item). */
const bubble = (page: Page, text: string) =>
  page.getByRole("list", { name: "Conversation" }).getByText(text, { exact: true });

test("start, chat, reload, resume and end a conversation", async ({ page }) => {
  await signIn(page, liveUser());
  await page.goto("/simulator/office-hours");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
  const conversationUrl = page.url();
  const conversationId = conversationUrl.split("/").at(-1)!;

  // The scenario's own opening line, from the professor.
  await expect(bubble(page, "Hey! Come on in. What can I help you with?")).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Sample replies");

  await page.getByLabel("Your message").fill("Hi professor, I'm stuck on question 3.");
  await page.getByLabel("Your message").press("Enter");
  await expect(bubble(page, "Oh, okay. Can you tell me a bit more about that?")).toBeVisible();
  await expect(page.getByLabel("Your message")).toHaveValue("");

  // Reload-safe: the conversation lives in the database.
  await page.reload();
  await expect(bubble(page, "Hi professor, I'm stuck on question 3.")).toBeVisible();
  await expect(bubble(page, "Oh, okay. Can you tell me a bit more about that?")).toBeVisible();

  // Starting the same scenario again resumes this conversation.
  await page.goto("/simulator/office-hours");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(conversationUrl);

  // End → the review page runs the (mock) review and shows it.
  await page.getByRole("button", { name: "End conversation" }).click();
  await page.getByRole("button", { name: "End and get feedback" }).click();
  await expect(page).toHaveURL(`${conversationUrl}/review`);
  await expect(page.getByRole("heading", { name: "How it went" })).toBeVisible();

  const { data: conversation } = await admin!
    .from("conversations")
    .select("status, ended_at, completed_at, review_attempts, overall_score, scenario_snapshot")
    .eq("id", conversationId)
    .single();
  expect(conversation).toMatchObject({ status: "completed", review_attempts: 1, overall_score: 69 });
  expect(conversation?.ended_at).not.toBeNull();
  expect(conversation?.completed_at).not.toBeNull();
  expect(conversation?.scenario_snapshot).toMatchObject({ slug: "office-hours", title: "Office Hours" });

  const { data: messages } = await admin!
    .from("messages")
    .select("id, role, seq")
    .eq("conversation_id", conversationId)
    .order("seq");
  expect(messages?.map(({ role, seq }) => ({ role, seq }))).toEqual([
    { role: "assistant", seq: 0 },
    { role: "user", seq: 1 },
    { role: "assistant", seq: 2 },
  ]);
  // The mock reviewer corrects the first learner message only.
  const { data: corrections } = await admin!
    .from("corrections")
    .select("message_id, position")
    .eq("conversation_id", conversationId);
  expect(corrections).toEqual([{ message_id: messages![1]!.id, position: 0 }]);

  // The chat URL now leads to the review; reloading doesn't review twice.
  await page.goto(conversationUrl);
  await expect(page).toHaveURL(`${conversationUrl}/review`);
  await expect(page.getByRole("heading", { name: "How it went" })).toBeVisible();
  const { data: feedback } = await admin!
    .from("conversation_feedback")
    .select("id")
    .eq("conversation_id", conversationId);
  expect(feedback).toHaveLength(1);
});

test("a failed review can be retried, and an empty conversation is abandoned", async ({ page }) => {
  await signIn(page, liveUser());
  await page.goto("/simulator/office-hours");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
  const emptyUrl = page.url();

  // Ending without writing anything: nothing to review.
  await page.getByRole("button", { name: "End conversation" }).click();
  await page.getByRole("button", { name: "End and get feedback" }).click();
  await expect(page.getByText(/ended before you wrote anything/)).toBeVisible();
  const emptyId = emptyUrl.split("/").at(-1)!;
  const { data: empty } = await admin!.from("conversations").select("status").eq("id", emptyId).single();
  expect(empty?.status).toBe("abandoned");

  // A conversation whose last review attempt failed (e.g. a timeout) waits for "Try again".
  await page.goto("/simulator/office-hours");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").at(-1)!;
  await page.getByLabel("Your message").fill("Hi, could you walk me through question 3?");
  await page.getByLabel("Your message").press("Enter");
  await expect(bubble(page, "Oh, okay. Can you tell me a bit more about that?")).toBeVisible();
  await admin!
    .from("conversations")
    .update({ status: "failed_review", review_error: "timeout", ended_at: new Date().toISOString() })
    .eq("id", id);

  await page.goto(`/conversations/${id}/review`);
  await expect(page.getByRole("alert").filter({ hasText: "That took too long" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "How it went" })).toBeVisible();
  const { data: retried } = await admin!
    .from("conversations")
    .select("status, review_attempts, review_error")
    .eq("id", id)
    .single();
  expect(retried).toEqual({ status: "completed", review_attempts: 1, review_error: null });
});

test("a custom scenario without an opening line gets one from the tutor", async ({ page }) => {
  const { data: scenario, error } = await admin!
    .from("scenarios")
    .insert({
      category: "custom",
      is_custom: true,
      created_by: liveUser().id,
      title: "Asking my advisor for an extension",
      user_role: "A PhD student",
      ai_role: "My advisor, Dr. Chen",
      goal: "Ask for one more week.",
      opening_line: null,
    })
    .select("id")
    .single();
  expect(error).toBeNull();

  await signIn(page, liveUser());
  await page.goto(`/simulator/custom/${scenario!.id}`);
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
  await expect(bubble(page, "Hi there! Thanks for coming by. What can I do for you?")).toBeVisible();

  // Writing the opening line spent AI quota.
  const { data: usage } = await admin!.from("ai_usage").select("calls").eq("user_id", liveUser().id);
  expect(usage?.reduce((sum, row) => sum + row.calls, 0)).toBeGreaterThanOrEqual(1);
});

test("the review annotates each message in place and saves expressions to My English", async ({ page }) => {
  await signIn(page, liveUser());
  await page.goto("/simulator/office-hours");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
  const conversationId = page.url().split("/").at(-1)!;

  const composer = page.getByLabel("Your message");
  await composer.fill("I have some question about the homework 3.");
  await composer.press("Enter");
  await expect(bubble(page, "Oh, okay. Can you tell me a bit more about that?")).toBeVisible();
  await composer.fill("Explain question 3 to me again.");
  await composer.press("Enter");
  await expect(bubble(page, "I see what you mean. How long has that been going on?")).toBeVisible();

  await page.getByRole("button", { name: "End conversation" }).click();
  await page.getByRole("button", { name: "End and get feedback" }).click();
  await expect(page.getByRole("heading", { name: "How it went" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Sample review");
  await expect(page.getByText("AI-estimated learning indicators", { exact: false })).toBeVisible();

  // The mock reviewer corrects the first learner message; the second is only "not selected".
  const transcript = page.getByRole("list", { name: "Conversation with review" });
  const items = transcript.locator(":scope > li");
  await expect(items).toHaveCount(5);
  await expect(items.nth(1)).toContainText("What you said");
  await expect(items.nth(1)).toContainText("More natural");
  await expect(items.nth(3)).toContainText("No suggestions");
  await expect(items.nth(3)).not.toContainText("What you said");

  // Save the expression; the saved state comes from the server and survives a reload.
  await page.getByRole("button", { name: "Add to My English: Would you mind…?" }).click();
  const saved = page.getByRole("link", { name: "In My English: Would you mind…?" });
  await expect(saved).toBeVisible();
  await page.reload();
  await expect(saved).toBeVisible();

  const { data: item } = await admin!
    .from("learning_items")
    .select("id, source, source_conversation_id, source_correction_id, example")
    .eq("user_id", liveUser().id)
    .eq("expression", "Would you mind…?")
    .single();
  expect(item).toMatchObject({ source: "review", source_conversation_id: conversationId });
  expect(item?.source_correction_id).not.toBeNull();

  // The item page links back to the review.
  await saved.click();
  await expect(page.getByRole("heading", { level: 1, name: "Would you mind…?" })).toBeVisible();
  await page.getByRole("link", { name: "Saved from a conversation review" }).click();
  await expect(page).toHaveURL(`/conversations/${conversationId}/review`);

  // Deleted elsewhere → "Add" again on the next visit.
  await admin!.from("learning_items").delete().eq("id", item!.id);
  await page.reload();
  await expect(page.getByRole("button", { name: "Add to My English: Would you mind…?" })).toBeVisible();
});

test("Conversation History lists conversations with their status and opens the right page", async ({
  page,
}) => {
  await signIn(page, liveUser());
  await page.goto("/simulator/office-hours");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").at(-1)!;
  await page.getByLabel("Your message").fill("Hi professor, I'm stuck on question 3.");
  await page.getByLabel("Your message").press("Enter");
  await expect(bubble(page, "Oh, okay. Can you tell me a bit more about that?")).toBeVisible();

  await page.goto("/conversations");
  const list = page.getByRole("list", { name: "Conversations" });
  const row = list.locator(`a[href="/conversations/${id}"]`);
  await expect(row).toContainText("Office Hours");
  await expect(row).toContainText("In progress");
  await expect(row).toContainText("1 turn");

  // Once reviewed, the row shows the overall label and opens the review.
  await row.click();
  await page.getByRole("button", { name: "End conversation" }).click();
  await page.getByRole("button", { name: "End and get feedback" }).click();
  await expect(page.getByRole("heading", { name: "How it went" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Conversation History" }).click();
  const reviewed = list.locator(`a[href="/conversations/${id}/review"]`);
  await expect(reviewed).toContainText("Reviewed");
  await expect(reviewed).toContainText("Developing");
  await reviewed.click();
  await expect(page.getByRole("heading", { name: "How it went" })).toBeVisible();

  // Today's recent activity shows it as reviewed and links to the same review.
  await page.goto("/today");
  const activity = page
    .getByRole("region", { name: "Recent activity" })
    .locator(`a[href="/conversations/${id}/review"]`);
  await expect(activity).toContainText("Reviewed");
  await activity.click();
  await expect(page.getByRole("heading", { name: "How it went" })).toBeVisible();
});
