import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "../a11y";
import { admin } from "./helpers";

// The V1 golden path (docs/PRODUCT.md → Key user flow, ARCHITECTURE.md → Testing strategy), in one
// run against the real Supabase project with the mock AI:
//
//   sign in → onboarding → Today → Office Hours → end → review → save an expression →
//   a gap appears → Today recommends practicing it → a focused conversation starts
//
// It starts at sign-in, not the sign-up form: signing up sends a real confirmation email through
// Supabase's built-in mailer, which allows only a few per hour. The user is created confirmed but
// not onboarded, so onboarding runs through the real UI. Sign-up is unit-tested and was checked
// by hand in M2.

test.skip(!admin, "Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");

const email = `e2e-golden-${randomBytes(6).toString("hex")}@example.com`;
const password = randomBytes(18).toString("base64url");
let userId = "";

test.beforeAll(async () => {
  const created = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Mei" },
  });
  if (created.error) throw new Error(`createUser: ${created.error.message}`);
  userId = created.data.user.id;
});

test.afterAll(async () => {
  if (userId) await admin!.auth.admin.deleteUser(userId);
});

/** A chat bubble with exactly this text. */
const bubble = (page: Page, text: string) =>
  page.getByRole("list", { name: "Conversation" }).getByText(text, { exact: true });

async function send(page: Page, text: string, reply: string) {
  const composer = page.getByLabel("Your message");
  await composer.fill(text);
  // Enter only sends once the previous turn has been saved.
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await composer.press("Enter");
  await expect(bubble(page, reply)).toBeVisible();
}

test("the V1 golden path: onboarding → practice → review → gap → focused practice", async ({ page }) => {
  test.setTimeout(180_000);

  // Sign in: a new learner is sent to onboarding first.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  // Onboarding, four steps.
  await expectNoA11yViolations(page, "onboarding");
  await expect(page.getByLabel("What should we call you?")).toHaveValue("Mei");
  await page.getByLabel("Your native language").fill("Chinese (Mandarin)");
  await page.getByRole("button", { name: "Continue" }).click();
  // The inputs are visually hidden; learners click the styled label.
  await page.locator("label").filter({ hasText: "Upper intermediate" }).click();
  await expect(page.getByRole("radio", { name: /Upper intermediate/ })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("label").filter({ hasText: "Campus" }).click();
  await expect(page.getByRole("checkbox", { name: /Campus/ })).toBeChecked();
  await page.getByLabel(/What do you want to get better at/).fill("Sound natural at office hours.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("label").filter({ hasText: /^15/ }).click();
  await expect(page.getByRole("radio", { name: /^15/ })).toBeChecked();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/today$/);

  // Today, before any practice: a plan, no focus areas yet.
  await expect(page.getByRole("region", { name: "Today's plan" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Focus areas" })).toContainText("No focus areas yet");
  await expectNoA11yViolations(page, "today (new learner)");

  // Practice: Office Hours, two turns, then end.
  await page.goto("/simulator/office-hours");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
  await expectNoA11yViolations(page, "chat");
  await send(page, "I want ask about the homework 3.", "Oh, okay. Can you tell me a bit more about that?");
  await send(
    page,
    "Could you walk me through question 3?",
    "I see what you mean. How long has that been going on?",
  );
  await page.getByRole("button", { name: "End conversation" }).click();
  await page.getByRole("button", { name: "End and get feedback" }).click();

  // Review: annotated in place, an expression saved to My English.
  await expect(page.getByRole("heading", { name: "How it went" })).toBeVisible();
  const transcript = page.getByRole("list", { name: "Conversation with review" });
  await expect(transcript.locator(":scope > li").nth(1)).toContainText("More natural");
  await expect(transcript.locator(":scope > li").nth(3)).toContainText("No suggestions");
  await expectNoA11yViolations(page, "review");
  await page.getByRole("button", { name: "Add to My English: Would you mind…?" }).click();
  await expect(page.getByRole("link", { name: "In My English: Would you mind…?" })).toBeVisible();

  // Detect: the review's evidence created a gap, listed in the Gap Tracker.
  const patterns = page.getByRole("region", { name: "Patterns from this conversation" });
  await expect(patterns.getByRole("link", { name: /Word choice/ })).toContainText("Focus area");
  await page.goto("/gaps");
  await expectNoA11yViolations(page, "gap tracker");
  await expect(
    page.getByRole("region", { name: /Focus areas/ }).getByRole("link", { name: /Word choice/ }),
  ).toBeVisible();

  // Today now recommends practicing that gap, and the link opens a brief focused on it.
  await page.goto("/today");
  const plan = page.getByRole("region", { name: "Today's plan" });
  await expect(plan).toContainText('Practice "Word choice": seen 1× in 1 conversation.');
  await expect(page.getByRole("region", { name: "Focus areas" })).toContainText("Word choice");
  await expectNoA11yViolations(page, "today (with a gap)");
  await plan.locator('a[href*="?gap="]').click();
  await expect(page.getByRole("region", { name: "Focus: Word choice" })).toBeVisible();
  await expectNoA11yViolations(page, "focused brief");

  // Reuse: the next conversation practices the gap.
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Focus:", { exact: true })).toBeVisible();

  // The saved expression is in My English, and the conversation is in the history.
  await page.goto("/my-english");
  await expect(page.getByRole("link", { name: /Would you mind…\?/ })).toBeVisible();
  await expectNoA11yViolations(page, "my english");
  await page.goto("/conversations");
  await expect(page.getByRole("list", { name: "Conversations" })).toContainText("Reviewed");
  await expectNoA11yViolations(page, "conversation history");

  // The profile the learner filled in during onboarding was saved.
  const { data: profile } = await admin!
    .from("profiles")
    .select("display_name, native_language, english_level, contexts, daily_goal_minutes, onboarded_at")
    .eq("id", userId)
    .single();
  expect(profile).toMatchObject({
    display_name: "Mei",
    native_language: "Chinese (Mandarin)",
    english_level: "upper_intermediate",
    contexts: ["campus"],
    daily_goal_minutes: 15,
  });
  expect(profile?.onboarded_at).not.toBeNull();
});
