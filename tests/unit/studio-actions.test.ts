import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockStudioCard } from "@/lib/ai/fixtures/studio";
import { IDLE_SAVE_STATE, IDLE_STUDIO_STATE } from "@/lib/actions/studio-state";

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
const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh: () => refresh() }));

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const ITEM_ID = "1b2c3d4e-5f60-4a1b-8c2d-3e4f5a6b7c8d";
const CURATED_ID = "2c3d4e5f-6071-4b2c-9d3e-4f5a6b7c8d9e";

const auth = { getAuthState: vi.fn(), getCurrentProfile: vi.fn(), requireUser: vi.fn() };
vi.mock("@/lib/auth/dal", () => ({
  getAuthState: () => auth.getAuthState(),
  getCurrentProfile: () => auth.getCurrentProfile(),
  requireUser: (next?: string) => auth.requireUser(next),
}));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { explainExpressionAction, saveStudioCardAction, addCuratedAction, deleteItemAction } =
  await import("@/lib/actions/studio");

type Call = [method: string, ...args: unknown[]];
type Query = { table: string; calls: Call[] };
type Result = { data?: unknown; error?: { code: string } | null };

/** Records every query; `respond` decides each result. `rpc` handles consume_ai_quota. */
function fakeSupabase(respond: (query: Query) => Result, quotaAllowed = true) {
  const queries: Query[] = [];
  const rpc = vi.fn(async () => ({
    data: [{ allowed: quotaAllowed, calls: 1, daily_limit: 50 }],
    error: null,
  }));
  const from = (table: string) => {
    const query: Query = { table, calls: [] };
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "insert", "delete", "eq", "ilike", "limit", "maybeSingle", "single"]) {
      builder[method] = (...args: unknown[]) => {
        query.calls.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null, ...respond(query) }).then(resolve);
    return builder;
  };
  return { client: { from, rpc }, queries, rpc };
}

const has = (query: Query, method: string) => query.calls.some(([m]) => m === method);
const inserted = (query: Query | undefined) =>
  query?.calls.find(([m]) => m === "insert")?.[1] as Record<string, unknown>;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
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
  refresh.mockReset();
  createClient.mockReset();
  auth.getAuthState
    .mockReset()
    .mockResolvedValue({ status: "signed_in", user: { id: USER_ID, email: null } });
  auth.requireUser.mockReset().mockResolvedValue({ id: USER_ID, email: null });
  auth.getCurrentProfile
    .mockReset()
    .mockResolvedValue({ nativeLanguage: "Spanish", englishLevel: "advanced" });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("explainExpressionAction", () => {
  it("validates input before doing anything", async () => {
    const state = await explainExpressionAction(
      IDLE_STUDIO_STATE,
      form({ expression: "  ", kind: "vocabulary" }),
    );
    expect(state).toEqual({ status: "error", message: "Type a word or phrase." });
    expect(auth.getAuthState).not.toHaveBeenCalled();
  });

  it("spends quota and returns a sample card, noting an existing saved copy", async () => {
    const fake = fakeSupabase(() => ({ data: { id: ITEM_ID } }));
    createClient.mockResolvedValue(fake.client);

    const state = await explainExpressionAction(
      IDLE_STUDIO_STATE,
      form({ expression: "touch base", kind: "expression" }),
    );

    expect(fake.rpc).toHaveBeenCalledWith("consume_ai_quota");
    expect(state).toMatchObject({ status: "result", kind: "expression", sample: true, savedItemId: ITEM_ID });
    const lookup = fake.queries[0]!;
    expect(lookup.calls).toContainEqual(["eq", "user_id", USER_ID]);
    expect(lookup.calls).toContainEqual(["ilike", "expression", "touch base"]);
  });

  it("escapes LIKE wildcards when checking for a saved copy", async () => {
    const fake = fakeSupabase(() => ({ data: null }));
    createClient.mockResolvedValue(fake.client);
    await explainExpressionAction(IDLE_STUDIO_STATE, form({ expression: "100%_sure", kind: "expression" }));
    expect(fake.queries[0]!.calls).toContainEqual(["ilike", "expression", "100\\%\\_sure"]);
  });

  it("explains the daily limit without calling the model", async () => {
    createClient.mockResolvedValue(fakeSupabase(() => ({}), false).client);
    const state = await explainExpressionAction(
      IDLE_STUDIO_STATE,
      form({ expression: "touch base", kind: "expression" }),
    );
    expect(state).toEqual({
      status: "error",
      message: "You've reached today's limit for AI requests. It resets tomorrow (UTC).",
    });
  });

  it("works without Supabase only with the mock provider (no quota otherwise)", async () => {
    auth.getAuthState.mockResolvedValue({ status: "unconfigured" });
    const ok = await explainExpressionAction(
      IDLE_STUDIO_STATE,
      form({ expression: "tentative", kind: "vocabulary" }),
    );
    expect(ok).toMatchObject({ status: "result", sample: true, savedItemId: null });

    vi.stubEnv("AI_PROVIDER", "anthropic");
    const refused = await explainExpressionAction(
      IDLE_STUDIO_STATE,
      form({ expression: "tentative", kind: "vocabulary" }),
    );
    expect(refused).toEqual({ status: "error", message: "AI isn't set up for this app yet." });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("saveStudioCardAction", () => {
  const card = mockStudioCard("touch base", "expression");

  it("re-validates the card and saves it as a studio item", async () => {
    const fake = fakeSupabase(() => ({ data: { id: ITEM_ID } }));
    createClient.mockResolvedValue(fake.client);

    const state = await saveStudioCardAction(IDLE_SAVE_STATE, form({ card: JSON.stringify(card) }));

    expect(state).toEqual({ status: "saved", itemId: ITEM_ID, alreadySaved: false });
    expect(inserted(fake.queries[0])).toMatchObject({
      user_id: USER_ID,
      type: "phrase",
      expression: "touch base",
      meaning: card.coreMeaning,
      example: card.examples[0],
      source: "studio",
      details: card,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("rejects tampered or malformed cards", async () => {
    for (const raw of ["not json", JSON.stringify({ ...card, frequency: 9 }), "x".repeat(20_001)]) {
      expect(await saveStudioCardAction(IDLE_SAVE_STATE, form({ card: raw }))).toMatchObject({
        status: "error",
      });
    }
    expect(createClient).not.toHaveBeenCalled();
  });

  it("points to the existing copy when the expression is already saved", async () => {
    const fake = fakeSupabase((q) =>
      has(q, "insert") ? { error: { code: "23505" } } : { data: { id: ITEM_ID } },
    );
    createClient.mockResolvedValue(fake.client);
    expect(await saveStudioCardAction(IDLE_SAVE_STATE, form({ card: JSON.stringify(card) }))).toEqual({
      status: "saved",
      itemId: ITEM_ID,
      alreadySaved: true,
    });
  });
});

describe("addCuratedAction", () => {
  it("copies the curated expression with its context", async () => {
    const fake = fakeSupabase((q) =>
      q.table === "curated_expressions"
        ? {
            data: {
              id: CURATED_ID,
              expression: "Something came up.",
              meaning: "Plans changed.",
              used_when: "Changing plans.",
              example: "Sorry, something came up.",
              register: "casual_neutral",
              frequency: 5,
            },
          }
        : { data: { id: ITEM_ID } },
    );
    createClient.mockResolvedValue(fake.client);

    expect(await addCuratedAction(IDLE_SAVE_STATE, form({ curatedId: CURATED_ID }))).toMatchObject({
      status: "saved",
      itemId: ITEM_ID,
    });
    expect(inserted(fake.queries.find((q) => q.table === "learning_items"))).toMatchObject({
      type: "expression",
      expression: "Something came up.",
      source: "curated",
      source_curated_id: CURATED_ID,
      details: { usedWhen: "Changing plans.", register: "casual_neutral", frequency: 5 },
    });
  });

  it("rejects a malformed id", async () => {
    expect(await addCuratedAction(IDLE_SAVE_STATE, form({ curatedId: "1 or 1=1" }))).toMatchObject({
      status: "error",
    });
  });
});

describe("deleteItemAction", () => {
  it("deletes only the learner's own row and goes back", async () => {
    const fake = fakeSupabase(() => ({}));
    createClient.mockResolvedValue(fake.client);
    expect(await redirectTarget(deleteItemAction(form({ itemId: ITEM_ID, back: "/expressions" })))).toBe(
      "/expressions",
    );
    const del = fake.queries[0]!;
    expect(has(del, "delete")).toBe(true);
    expect(del.calls).toContainEqual(["eq", "id", ITEM_ID]);
    expect(del.calls).toContainEqual(["eq", "user_id", USER_ID]);
  });

  it("never redirects off-site", async () => {
    createClient.mockResolvedValue(fakeSupabase(() => ({})).client);
    expect(
      await redirectTarget(deleteItemAction(form({ itemId: ITEM_ID, back: "https://evil.example" }))),
    ).toBe("/my-english");
  });
});
