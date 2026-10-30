import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewFailure } from "@/lib/actions/conversation-review-state";
import { AIError } from "@/lib/ai/errors";
import type { Conversation } from "@/lib/data/conversations";

vi.mock("server-only", () => ({}));
const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh: () => refresh() }));

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const CONVERSATION_ID = "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c";

const dal = { requireUser: vi.fn(), getCurrentProfile: vi.fn() };
vi.mock("@/lib/auth/dal", () => ({
  requireUser: (next?: string) => dal.requireUser(next),
  getCurrentProfile: () => dal.getCurrentProfile(),
}));
const getConversation = vi.fn();
vi.mock("@/lib/data/conversations", () => ({
  getConversation: (userId: string, id: string) => getConversation(userId, id),
}));
const reviewConversation = vi.fn();
vi.mock("@/lib/ai/services/reviewer", () => ({
  reviewConversation: (...args: unknown[]) => reviewConversation(...args),
}));
const consumeAiQuota = vi.fn(async () => {});
vi.mock("@/lib/ai/quota", () => ({ consumeAiQuota: () => consumeAiQuota() }));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { runReviewAction, saveReviewExpressionAction } = await import("@/lib/actions/conversation-review");

const CONVERSATION: Conversation = {
  id: CONVERSATION_ID,
  status: "reviewing",
  scenario: {
    scenarioId: null,
    slug: "office-hours",
    isCustom: false,
    category: "campus",
    title: "Office Hours",
    description: "",
    userRole: "A student",
    aiRole: "Professor Lee",
    aiPersonality: "",
    goal: "Ask for help.",
    difficulty: "intermediate",
    openingLine: "Hey!",
    estMinutes: 8,
  },
  startedAt: "2026-10-29T12:00:00Z",
  endedAt: "2026-10-29T12:10:00Z",
  reviewError: null,
  messages: [
    { id: "m0", role: "assistant", content: "Hey!", seq: 0, createdAt: "" },
    { id: "m1", role: "user", content: "Hi professor.", seq: 1, createdAt: "" },
  ],
  targets: [{ itemId: "item-1", expression: "walk me through", meaning: "explain step by step" }],
};

const REVIEW = { model: "mock/reviewer-v1", summary: "ok", corrections: [], targetItemsUsed: [] };

type Update = { values: unknown; filters: [string, unknown][] };

function fakeSupabase(opts: {
  claim?: { data?: unknown; error?: { code: string } | null };
  apply?: { data?: unknown; error?: { code: string } | null };
}) {
  const updates: Update[] = [];
  const rpc = vi.fn(async (name: string) => {
    if (name === "claim_conversation_review") return { data: "claimed", error: null, ...opts.claim };
    if (name === "apply_conversation_review") return { data: true, error: null, ...opts.apply };
    throw new Error(`unexpected rpc ${name}`);
  });
  const from = vi.fn(() => ({
    update(values: unknown) {
      const update: Update = { values, filters: [] };
      updates.push(update);
      const chain = {
        eq(column: string, value: unknown) {
          update.filters.push([column, value]);
          return chain;
        },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      };
      return chain;
    },
  }));
  return { client: { rpc, from }, rpc, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  dal.requireUser.mockResolvedValue({ id: USER_ID });
  dal.getCurrentProfile.mockResolvedValue({ englishLevel: "advanced", nativeLanguage: "Korean" });
  getConversation.mockResolvedValue(CONVERSATION);
  reviewConversation.mockResolvedValue({ review: REVIEW, sample: true, dropped: 0 });
});

describe("runReviewAction", () => {
  it("claims, reviews and applies the review once", async () => {
    const fake = fakeSupabase({});
    createClient.mockResolvedValue(fake.client);

    expect(await runReviewAction(CONVERSATION_ID)).toEqual({ status: "completed" });
    expect(dal.requireUser).toHaveBeenCalledWith(`/conversations/${CONVERSATION_ID}/review`);
    expect(fake.rpc).toHaveBeenNthCalledWith(1, "claim_conversation_review", {
      p_conversation_id: CONVERSATION_ID,
    });
    const [input, deps] = reviewConversation.mock.calls[0]!;
    expect(input).toMatchObject({
      learner: { englishLevel: "advanced", nativeLanguage: "Korean" },
      targets: CONVERSATION.targets,
      messages: [
        { id: "m0", role: "assistant", content: "Hey!" },
        { id: "m1", role: "user", content: "Hi professor." },
      ],
    });
    await deps.consumeQuota();
    expect(consumeAiQuota).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenNthCalledWith(2, "apply_conversation_review", {
      p_conversation_id: CONVERSATION_ID,
      p_review: REVIEW,
    });
    expect(fake.updates).toEqual([]);
  });

  it.each(["in_progress", "completed", "active", "abandoned"] as const)(
    "doesn't run the reviewer when the claim says %s",
    async (claim) => {
      const fake = fakeSupabase({ claim: { data: claim } });
      createClient.mockResolvedValue(fake.client);
      expect(await runReviewAction(CONVERSATION_ID)).toEqual({ status: claim });
      expect(reviewConversation).not.toHaveBeenCalled();
    },
  );

  it("treats someone else's or a missing conversation as missing", async () => {
    const fake = fakeSupabase({ claim: { data: null, error: { code: "P0002" } } });
    createClient.mockResolvedValue(fake.client);
    expect(await runReviewAction(CONVERSATION_ID)).toEqual({ status: "missing" });
    expect(await runReviewAction("not-a-uuid")).toEqual({ status: "missing" });
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it("records an AI failure as failed_review with its code, conditionally", async () => {
    const fake = fakeSupabase({});
    createClient.mockResolvedValue(fake.client);
    reviewConversation.mockRejectedValue(new AIError("provider_quota"));

    const result = await runReviewAction(CONVERSATION_ID);
    expect(result).toEqual({ status: "failed", ...reviewFailure("provider_quota") });
    expect(result).toMatchObject({ canRetry: true, message: expect.stringMatching(/free AI quota/) });
    expect(fake.updates).toEqual([
      {
        values: { status: "failed_review", review_error: "provider_quota" },
        filters: [
          ["id", CONVERSATION_ID],
          ["user_id", USER_ID],
          ["status", "reviewing"],
        ],
      },
    ]);
    expect(fake.rpc).not.toHaveBeenCalledWith("apply_conversation_review", expect.anything());
  });

  it("doesn't offer a retry when there's nothing to review", async () => {
    createClient.mockResolvedValue(fakeSupabase({}).client);
    reviewConversation.mockRejectedValue(new AIError("invalid_input"));
    expect(await runReviewAction(CONVERSATION_ID)).toMatchObject({ status: "failed", canRetry: false });
  });

  it("records a failed save, and unexpected errors, as save_failed", async () => {
    const fake = fakeSupabase({ apply: { data: null, error: { code: "22023" } } });
    createClient.mockResolvedValue(fake.client);
    expect(await runReviewAction(CONVERSATION_ID)).toMatchObject({ status: "failed", canRetry: true });
    expect(fake.updates[0]?.values).toEqual({ status: "failed_review", review_error: "save_failed" });

    const again = fakeSupabase({});
    createClient.mockResolvedValue(again.client);
    getConversation.mockRejectedValue(new Error("db down"));
    expect(await runReviewAction(CONVERSATION_ID)).toMatchObject({ status: "failed" });
    expect(again.updates[0]?.values).toEqual({ status: "failed_review", review_error: "save_failed" });
  });
});

describe("reviewFailure", () => {
  it("uses review wording, and a generic message for unknown codes", () => {
    expect(reviewFailure("invalid_output").message).toMatch(/review didn't come out right/);
    expect(reviewFailure("timeout")).toEqual({
      message: "That took too long. Please try again.",
      canRetry: true,
    });
    expect(reviewFailure(null)).toEqual({
      message: "We couldn't save your review. Please try again.",
      canRetry: true,
    });
  });
});

describe("saveReviewExpressionAction", () => {
  const CORRECTION_ID = "6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d";
  const ROW = {
    id: CORRECTION_ID,
    conversation_id: CONVERSATION_ID,
    original: "Explain it to me again.",
    improved: "Could you help me understand it?",
    explanation: "A question sounds more respectful.",
    saveable_expressions: [{ expression: " Could you help me understand…? ", meaning: "a polite request" }],
  };

  type Call = [string, ...unknown[]];
  function fake(opts: { correction?: unknown; insertError?: { code: string } | null; existingId?: string }) {
    const queries: { table: string; calls: Call[] }[] = [];
    const from = (table: string) => {
      const query = { table, calls: [] as Call[] };
      queries.push(query);
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "insert", "eq", "ilike", "limit", "maybeSingle", "single"]) {
        builder[m] = (...args: unknown[]) => {
          query.calls.push([m, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        const inserting = query.calls.some(([m]) => m === "insert");
        const result =
          table === "corrections"
            ? { data: opts.correction === undefined ? ROW : opts.correction, error: null }
            : inserting
              ? opts.insertError
                ? { data: null, error: opts.insertError }
                : { data: { id: "new-item" }, error: null }
              : { data: opts.existingId ? { id: opts.existingId } : null, error: null };
        return Promise.resolve(result).then(resolve);
      };
      return builder;
    };
    return { client: { from }, queries };
  }
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    return data;
  };
  const IDLE = { status: "idle" } as const;

  it("saves the stored expression, not client text, with links back to the review", async () => {
    const f = fake({});
    createClient.mockResolvedValue(f.client);
    const result = await saveReviewExpressionAction(IDLE, form({ correctionId: CORRECTION_ID, index: "0" }));
    expect(result).toEqual({ status: "saved", itemId: "new-item", alreadySaved: false });

    const read = f.queries.find((q) => q.table === "corrections")!;
    expect(read.calls).toContainEqual(["eq", "id", CORRECTION_ID]);
    expect(read.calls).toContainEqual(["eq", "user_id", USER_ID]);
    const insert = f.queries
      .find((q) => q.table === "learning_items")!
      .calls.find(([m]) => m === "insert")![1];
    expect(insert).toMatchObject({
      user_id: USER_ID,
      type: "expression",
      expression: "Could you help me understand…?",
      meaning: "a polite request",
      example: "Could you help me understand it?",
      source: "review",
      source_conversation_id: CONVERSATION_ID,
      source_correction_id: CORRECTION_ID,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("returns the existing item when the expression is already saved", async () => {
    createClient.mockResolvedValue(fake({ insertError: { code: "23505" }, existingId: "old-item" }).client);
    expect(await saveReviewExpressionAction(IDLE, form({ correctionId: CORRECTION_ID, index: "0" }))).toEqual(
      {
        status: "saved",
        itemId: "old-item",
        alreadySaved: true,
      },
    );
  });

  it("rejects a bad index, a missing correction and malformed input", async () => {
    createClient.mockResolvedValue(fake({}).client);
    expect(
      await saveReviewExpressionAction(IDLE, form({ correctionId: CORRECTION_ID, index: "1" })),
    ).toMatchObject({
      status: "error",
    });
    createClient.mockResolvedValue(fake({ correction: null }).client);
    expect(
      await saveReviewExpressionAction(IDLE, form({ correctionId: CORRECTION_ID, index: "0" })),
    ).toMatchObject({
      status: "error",
    });
    expect(await saveReviewExpressionAction(IDLE, form({ correctionId: "nope", index: "0" }))).toMatchObject({
      status: "error",
    });
  });
});
