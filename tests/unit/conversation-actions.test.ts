import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_START_STATE } from "@/lib/actions/conversation-state";
import type { Scenario } from "@/lib/data/scenarios";

vi.mock("server-only", () => ({}));
class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const CONVERSATION_ID = "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c";
const CUSTOM_ID = "3d4e5f60-7182-4c3d-8e4f-5a6b7c8d9e0f";

const dal = { requireUser: vi.fn(), getCurrentProfile: vi.fn() };
vi.mock("@/lib/auth/dal", () => ({
  requireUser: (next?: string) => dal.requireUser(next),
  getCurrentProfile: () => dal.getCurrentProfile(),
}));
const listSavedItems = vi.fn();
vi.mock("@/lib/data/items", () => ({ listSavedItems: (id: string) => listSavedItems(id) }));
const scenarios = { getSharedScenario: vi.fn(), getCustomScenario: vi.fn() };
vi.mock("@/lib/data/scenarios", () => ({
  getSharedScenario: (slug: string) => scenarios.getSharedScenario(slug),
  getCustomScenario: (userId: string, id: string) => scenarios.getCustomScenario(userId, id),
}));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { endConversationAction, startConversationAction } = await import("@/lib/actions/conversation");

const SCENARIO: Scenario = {
  id: "11111111-2222-4333-8444-555555555555",
  slug: "office-hours",
  category: "campus",
  title: "Office Hours",
  description: "Stuck on homework.",
  userRole: "A student",
  aiRole: "Professor Lee",
  aiPersonality: "Friendly",
  goal: "Ask for clarification.",
  difficulty: "intermediate",
  openingLine: "Hey! Come on in.",
  estMinutes: 8,
  isCustom: false,
};

const ITEMS = [
  {
    id: "item-due",
    type: "phrase",
    expression: "touch base",
    meaning: "check in",
    masteryScore: 0.2,
    reviewCount: 1,
    nextReviewAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "item-known",
    type: "word",
    expression: "tentative",
    meaning: "not fixed",
    masteryScore: 0.95,
    reviewCount: 9,
    nextReviewAt: "2099-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

type Call = [method: string, ...args: unknown[]];
type Query = { table: string; calls: Call[] };
type Result = { data?: unknown; error?: { code: string } | null };

function fakeSupabase(respond: (q: Query) => Result = () => ({}), quotaAllowed = true) {
  const queries: Query[] = [];
  const rpc = vi.fn(async () => ({
    data: [{ allowed: quotaAllowed, calls: 1, daily_limit: 50 }],
    error: null,
  }));
  const from = (table: string) => {
    const query: Query = { table, calls: [] };
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const m of [
      "select",
      "insert",
      "update",
      "delete",
      "eq",
      "gte",
      "order",
      "limit",
      "maybeSingle",
      "single",
    ]) {
      builder[m] = (...args: unknown[]) => {
        query.calls.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null, ...respond(query) }).then(resolve);
    return builder;
  };
  return { client: { from, rpc }, queries, rpc };
}

const has = (q: Query, m: string) => q.calls.some(([c]) => c === m);
const arg = (q: Query | undefined, m: string) => q?.calls.find(([c]) => c === m)?.[1];
const find = (queries: Query[], table: string, method: string) =>
  queries.find((q) => q.table === table && has(q, method));

/** A fresh learner: no active conversation; the conversation insert returns an id. */
function happyPath(q: Query): Result {
  if (q.table === "conversations" && has(q, "insert")) return { data: { id: CONVERSATION_ID } };
  return { data: null };
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

async function redirectTarget(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
  throw new Error("Expected a redirect");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  dal.requireUser.mockReset().mockResolvedValue({ id: USER_ID, email: null });
  dal.getCurrentProfile
    .mockReset()
    .mockResolvedValue({ englishLevel: "advanced", nativeLanguage: "Spanish" });
  listSavedItems.mockReset().mockResolvedValue(ITEMS);
  scenarios.getSharedScenario.mockReset().mockResolvedValue(SCENARIO);
  scenarios.getCustomScenario.mockReset().mockResolvedValue(null);
  createClient.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("startConversationAction", () => {
  it("creates the conversation with a snapshot, targets and the scenario's opening line", async () => {
    const fake = fakeSupabase(happyPath);
    createClient.mockResolvedValue(fake.client);

    expect(
      await redirectTarget(startConversationAction(IDLE_START_STATE, form({ slug: "office-hours" }))),
    ).toBe(`/conversations/${CONVERSATION_ID}`);

    const conversation = arg(find(fake.queries, "conversations", "insert"), "insert") as Record<
      string,
      unknown
    >;
    expect(conversation).toMatchObject({
      user_id: USER_ID,
      scenario_id: SCENARIO.id,
      scenario_snapshot: {
        scenarioId: SCENARIO.id,
        slug: "office-hours",
        title: "Office Hours",
        aiRole: "Professor Lee",
      },
    });
    // Only the item that needs practice; the well-known one is left to spaced review.
    expect(arg(find(fake.queries, "conversation_targets", "insert"), "insert")).toEqual([
      { conversation_id: CONVERSATION_ID, user_id: USER_ID, item_id: "item-due" },
    ]);
    expect(arg(find(fake.queries, "messages", "insert"), "insert")).toEqual({
      conversation_id: CONVERSATION_ID,
      user_id: USER_ID,
      role: "assistant",
      content: "Hey! Come on in.",
      seq: 0,
    });
    // The scenario had an opening line: no AI call, no quota spent.
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("asks the tutor for an opening line (spending quota) when the scenario has none", async () => {
    scenarios.getCustomScenario.mockResolvedValue({
      ...SCENARIO,
      id: CUSTOM_ID,
      slug: null,
      isCustom: true,
      category: "custom",
      openingLine: null,
    });
    const fake = fakeSupabase(happyPath);
    createClient.mockResolvedValue(fake.client);

    await redirectTarget(startConversationAction(IDLE_START_STATE, form({ scenarioId: CUSTOM_ID })));
    expect(scenarios.getCustomScenario).toHaveBeenCalledWith(USER_ID, CUSTOM_ID);
    expect(fake.rpc).toHaveBeenCalledWith("consume_ai_quota");
    expect(arg(find(fake.queries, "messages", "insert"), "insert")).toMatchObject({
      role: "assistant",
      content: "Hi there! Thanks for coming by. What can I do for you?",
    });
  });

  it("creates nothing when the opening line can't be written", async () => {
    scenarios.getSharedScenario.mockResolvedValue({ ...SCENARIO, openingLine: null });
    const fake = fakeSupabase(happyPath, false);
    createClient.mockResolvedValue(fake.client);

    expect(await startConversationAction(IDLE_START_STATE, form({ slug: "office-hours" }))).toEqual({
      status: "error",
      message: "You've reached today's limit for AI requests. It resets tomorrow (UTC).",
    });
    expect(find(fake.queries, "conversations", "insert")).toBeUndefined();
  });

  it("removes the conversation if its setup fails", async () => {
    const fake = fakeSupabase((q) => (q.table === "messages" ? { error: { code: "42501" } } : happyPath(q)));
    createClient.mockResolvedValue(fake.client);

    expect(await startConversationAction(IDLE_START_STATE, form({ slug: "office-hours" }))).toMatchObject({
      status: "error",
    });
    const cleanup = find(fake.queries, "conversations", "delete")!;
    expect(cleanup.calls).toContainEqual(["eq", "id", CONVERSATION_ID]);
    expect(cleanup.calls).toContainEqual(["eq", "user_id", USER_ID]);
  });

  it("resumes a recent active conversation on the same scenario instead of starting another", async () => {
    const fake = fakeSupabase((q) =>
      q.table === "conversations" && has(q, "maybeSingle") ? { data: { id: "existing-id" } } : happyPath(q),
    );
    createClient.mockResolvedValue(fake.client);

    expect(
      await redirectTarget(startConversationAction(IDLE_START_STATE, form({ slug: "office-hours" }))),
    ).toBe("/conversations/existing-id");
    const lookup = find(fake.queries, "conversations", "maybeSingle")!;
    expect(lookup.calls).toContainEqual(["eq", "user_id", USER_ID]);
    expect(lookup.calls).toContainEqual(["eq", "scenario_id", SCENARIO.id]);
    expect(lookup.calls).toContainEqual(["eq", "status", "active"]);
    expect(find(fake.queries, "conversations", "insert")).toBeUndefined();
  });

  it("rejects a missing scenario or a malformed source", async () => {
    createClient.mockResolvedValue(fakeSupabase(happyPath).client);
    scenarios.getSharedScenario.mockResolvedValue(null);
    expect(await startConversationAction(IDLE_START_STATE, form({ slug: "office-hours" }))).toEqual({
      status: "error",
      message: "This scenario no longer exists.",
    });
    expect(await startConversationAction(IDLE_START_STATE, form({ slug: "../etc" }))).toMatchObject({
      status: "error",
    });
    expect(await startConversationAction(IDLE_START_STATE, form({ scenarioId: "nope" }))).toMatchObject({
      status: "error",
    });
  });
});

describe("endConversationAction", () => {
  it("moves only the learner's active conversation to reviewing, once", async () => {
    const fake = fakeSupabase();
    createClient.mockResolvedValue(fake.client);
    const data = new FormData();
    data.set("conversationId", CONVERSATION_ID);

    expect(await redirectTarget(endConversationAction(data))).toBe(`/conversations/${CONVERSATION_ID}`);
    const update = find(fake.queries, "conversations", "update")!;
    expect(arg(update, "update")).toMatchObject({ status: "reviewing", ended_at: expect.any(String) });
    expect(update.calls).toContainEqual(["eq", "id", CONVERSATION_ID]);
    expect(update.calls).toContainEqual(["eq", "user_id", USER_ID]);
    // Conditional: a second click or another tab finds no active row and changes nothing.
    expect(update.calls).toContainEqual(["eq", "status", "active"]);
  });

  it("ignores a malformed id", async () => {
    createClient.mockResolvedValue(fakeSupabase().client);
    const data = new FormData();
    data.set("conversationId", "nope");
    expect(await redirectTarget(endConversationAction(data))).toBe("/today");
  });
});
