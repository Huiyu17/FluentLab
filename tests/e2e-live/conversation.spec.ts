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

  await page.getByRole("button", { name: "End conversation" }).click();
  await page.getByRole("button", { name: "End and get feedback" }).click();
  await expect(page.getByText(/This conversation has ended/)).toBeVisible();
  await expect(page.getByLabel("Your message")).toHaveCount(0);

  const { data: conversation } = await admin!
    .from("conversations")
    .select("status, ended_at, scenario_snapshot")
    .eq("id", conversationId)
    .single();
  expect(conversation?.status).toBe("reviewing");
  expect(conversation?.ended_at).not.toBeNull();
  expect(conversation?.scenario_snapshot).toMatchObject({ slug: "office-hours", title: "Office Hours" });

  const { data: messages } = await admin!
    .from("messages")
    .select("role, seq")
    .eq("conversation_id", conversationId)
    .order("seq");
  expect(messages).toEqual([
    { role: "assistant", seq: 0 },
    { role: "user", seq: 1 },
    { role: "assistant", seq: 2 },
  ]);
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
