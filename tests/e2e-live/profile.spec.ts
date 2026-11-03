import { expect, test } from "@playwright/test";
import { expectNoA11yViolations, expectNoHorizontalOverflow } from "../a11y";
import { admin, setupLiveUser, signIn } from "./helpers";

// M9 Fluency Profile against the real Supabase project: two reviewed conversations are inserted
// with the service role (as apply_conversation_review would leave them), then charted.

const liveUser = setupLiveUser();

test("the Fluency Profile charts reviewed conversations and lists them as a table", async ({ page }) => {
  await signIn(page, liveUser());
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "No reviewed conversations yet" })).toBeVisible();

  const snapshot = (title: string) => ({
    scenarioId: null,
    slug: "office-hours",
    isCustom: false,
    category: "campus",
    title,
    description: "",
    userRole: "A student",
    aiRole: "Professor Lee",
    aiPersonality: "",
    goal: "Ask for help.",
    difficulty: "intermediate",
    openingLine: null,
    estMinutes: 8,
  });
  for (const [i, score] of [62, 71].entries()) {
    const { data: conversation, error } = await admin!
      .from("conversations")
      .insert({
        user_id: liveUser().id,
        status: "completed",
        scenario_snapshot: snapshot(i === 0 ? "Office Hours" : "Career Fair Chat"),
        completed_at: new Date(Date.now() - (1 - i) * 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const { error: feedbackError } = await admin!.from("conversation_feedback").insert({
      conversation_id: conversation!.id,
      user_id: liveUser().id,
      summary: "Check run.",
      overall_label: "developing",
      fluency_score: score,
      naturalness_score: score - 5,
      grammar_score: score + 3,
      vocabulary_score: score,
      confidence_score: score + 6,
      created_at: new Date(Date.now() - (1 - i) * 86_400_000).toISOString(),
    });
    expect(feedbackError).toBeNull();
  }

  await page.reload();
  const indicators = page.getByRole("list", { name: "Indicators" });
  await expect(indicators.getByRole("listitem")).toHaveCount(5);
  const fluency = indicators.getByRole("listitem").filter({ hasText: "Fluency" });
  await expect(fluency).toContainText("Latest: 71");
  await expect(fluency).toContainText("A trend appears after 4 reviews");
  await expect(fluency.locator("svg.recharts-surface")).toBeVisible();
  await expect(page.getByText(/AI-estimated learning indicators/).first()).toBeVisible();

  await expectNoA11yViolations(page, "fluency profile");
  await expectNoHorizontalOverflow(page, "fluency profile");
  await page.getByText("Show the numbers as a table").click();
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row").nth(1)).toContainText("Career Fair Chat");

  await page.screenshot({ path: "test-results/profile-page.png", fullPage: true });
});
