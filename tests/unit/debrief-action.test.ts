import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_DEBRIEF_STATE } from "@/lib/actions/debrief-state";
import { AIError, AI_ERROR_MESSAGES } from "@/lib/ai/errors";

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
const DEBRIEF_ID = "2b3c4d5e-6f70-4a8b-9c0d-1e2f3a4b5c6d";

const dal = { requireUser: vi.fn(), getCurrentProfile: vi.fn() };
vi.mock("@/lib/auth/dal", () => ({
  requireUser: (next?: string) => dal.requireUser(next),
  getCurrentProfile: () => dal.getCurrentProfile(),
}));
const coachDebrief = vi.fn();
vi.mock("@/lib/ai/services/debrief", () => ({ coachDebrief: (...args: unknown[]) => coachDebrief(...args) }));
const consumeAiQuota = vi.fn(async () => {});
vi.mock("@/lib/ai/quota", () => ({ consumeAiQuota: () => consumeAiQuota() }));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh: () => refresh() }));

const getDebrief = vi.fn();
vi.mock("@/lib/data/debriefs", () => ({
  getDebrief: (userId: string, id: string) => getDebrief(userId, id),
}));

const { createDebriefAction, deleteDebriefAction, practiceDebriefAction, saveDebriefExpressionAction } =
  await import("@/lib/actions/debrief");

const RESULT = { situationSummary: "Returning a jacket", phrasings: [], explanation: "x", expressions: [] };

function fakeSupabase(insertResult: { data: unknown; error: { code: string } | null }) {
  const inserts: unknown[] = [];
  const builder = {
    insert(values: unknown) {
      inserts.push(values);
      return builder;
    },
    select: () => builder,
    single: () => Promise.resolve(insertResult),
  };
  return { client: { from: vi.fn(() => builder) }, inserts };
}

function form(situation: string, whatYouSaid = "") {
  const data = new FormData();
  data.set("situation", situation);
  data.set("whatYouSaid", whatYouSaid);
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
  vi.clearAllMocks();
  dal.requireUser.mockResolvedValue({ id: USER_ID });
  dal.getCurrentProfile.mockResolvedValue({ englishLevel: "advanced", nativeLanguage: "Korean" });
  coachDebrief.mockResolvedValue({ result: RESULT, sample: false, model: "gemini/debrief-v1" });
});

describe("createDebriefAction", () => {
  it("coaches, then saves the debrief with its result and opens it", async () => {
    const fake = fakeSupabase({ data: { id: DEBRIEF_ID }, error: null });
    createClient.mockResolvedValue(fake.client);

    expect(
      await redirectTarget(
        createDebriefAction(IDLE_DEBRIEF_STATE, form("  At the store  ", "I want return")),
      ),
    ).toBe(`/debrief/${DEBRIEF_ID}`);
    const [input, deps] = coachDebrief.mock.calls[0]!;
    expect(input).toEqual({ situation: "At the store", whatYouSaid: "I want return" });
    expect(deps.learner).toEqual({ englishLevel: "advanced", nativeLanguage: "Korean" });
    await deps.consumeQuota();
    expect(consumeAiQuota).toHaveBeenCalledTimes(1);
    expect(fake.inserts).toEqual([
      {
        user_id: USER_ID,
        situation: "At the store",
        what_user_said: "I want return",
        result: { ...RESULT, model: "gemini/debrief-v1" },
      },
    ]);
  });

  it("reports field errors without calling the coach", async () => {
    const state = await createDebriefAction(IDLE_DEBRIEF_STATE, form("   "));
    expect(state).toEqual({ status: "error", fieldErrors: { situation: "Describe what happened." } });
    expect(coachDebrief).not.toHaveBeenCalled();
    expect(dal.requireUser).not.toHaveBeenCalled();
  });

  it("saves nothing when the coach fails, and says why", async () => {
    const fake = fakeSupabase({ data: { id: DEBRIEF_ID }, error: null });
    createClient.mockResolvedValue(fake.client);
    coachDebrief.mockRejectedValue(new AIError("provider_quota"));
    expect(await createDebriefAction(IDLE_DEBRIEF_STATE, form("At the bank"))).toEqual({
      status: "error",
      message: AI_ERROR_MESSAGES.provider_quota,
    });
    coachDebrief.mockRejectedValue(new AIError("invalid_output"));
    expect(await createDebriefAction(IDLE_DEBRIEF_STATE, form("At the bank"))).toEqual({
      status: "error",
      message: "The debrief didn't come out right. Please try again.",
    });
    expect(fake.inserts).toEqual([]);
  });

  it("reports a failed save", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createClient.mockResolvedValue(fakeSupabase({ data: null, error: { code: "23514" } }).client);
    expect(await createDebriefAction(IDLE_DEBRIEF_STATE, form("At the bank"))).toEqual({
      status: "error",
      message: "We couldn't save your debrief. Please try again.",
    });
  });
});

describe("saveDebriefExpressionAction", () => {
  const STORED = {
    situationSummary: "Returning a jacket without a receipt",
    phrasings: [
      { register: "casual", text: "Can you look up the transaction?", note: "" },
      { register: "neutral", text: "Is it possible to issue a refund?", note: "" },
    ],
    explanation: "x",
    expressions: [
      { expression: " issue a refund ", meaning: "give money back" },
      { expression: "misplaced my receipt", meaning: "lost it" },
    ],
    model: "gemini/debrief-v1",
  };
  type Call = [string, ...unknown[]];

  function fake(opts: { debrief?: unknown; insertError?: { code: string }; existingId?: string } = {}) {
    const queries: { table: string; calls: Call[] }[] = [];
    const from = (table: string) => {
      const query = { table, calls: [] as Call[] };
      queries.push(query);
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "insert", "delete", "eq", "ilike", "limit", "maybeSingle", "single"]) {
        builder[m] = (...args: unknown[]) => {
          query.calls.push([m, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        const inserting = query.calls.some(([m]) => m === "insert");
        const deleting = query.calls.some(([m]) => m === "delete");
        const result =
          table === "debriefs" && deleting
            ? { error: null }
            : table === "debriefs"
              ? {
                  data: opts.debrief === undefined ? { id: DEBRIEF_ID, result: STORED } : opts.debrief,
                  error: null,
                }
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

  it("saves the stored expression with a phrasing that uses it as the example", async () => {
    const f = fake();
    createClient.mockResolvedValue(f.client);
    expect(await saveDebriefExpressionAction(IDLE, form({ debriefId: DEBRIEF_ID, index: "0" }))).toEqual({
      status: "saved",
      itemId: "new-item",
      alreadySaved: false,
    });
    const read = f.queries.find((q) => q.table === "debriefs")!;
    expect(read.calls).toContainEqual(["eq", "user_id", USER_ID]);
    const insert = f.queries
      .find((q) => q.table === "learning_items")!
      .calls.find(([m]) => m === "insert")![1];
    expect(insert).toEqual({
      user_id: USER_ID,
      type: "expression",
      expression: "issue a refund",
      meaning: "give money back",
      example: "Is it possible to issue a refund?",
      details: { debrief: { situationSummary: "Returning a jacket without a receipt" } },
      source: "debrief",
      source_debrief_id: DEBRIEF_ID,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("returns the existing item for a duplicate, and rejects bad input", async () => {
    createClient.mockResolvedValue(fake({ insertError: { code: "23505" }, existingId: "old-item" }).client);
    expect(await saveDebriefExpressionAction(IDLE, form({ debriefId: DEBRIEF_ID, index: "1" }))).toEqual({
      status: "saved",
      itemId: "old-item",
      alreadySaved: true,
    });
    createClient.mockResolvedValue(fake().client);
    expect(
      await saveDebriefExpressionAction(IDLE, form({ debriefId: DEBRIEF_ID, index: "2" })),
    ).toMatchObject({
      status: "error",
    });
    createClient.mockResolvedValue(fake({ debrief: null }).client);
    expect(
      await saveDebriefExpressionAction(IDLE, form({ debriefId: DEBRIEF_ID, index: "0" })),
    ).toMatchObject({
      status: "error",
    });
    expect(await saveDebriefExpressionAction(IDLE, form({ debriefId: "nope", index: "0" }))).toMatchObject({
      status: "error",
    });
  });

  it("deletes only the learner's debrief and goes back to the list", async () => {
    const f = fake();
    createClient.mockResolvedValue(f.client);
    expect(await redirectTarget(deleteDebriefAction(form({ debriefId: DEBRIEF_ID })))).toBe("/debrief");
    const del = f.queries.find((q) => q.calls.some(([m]) => m === "delete"))!;
    expect(del.calls).toContainEqual(["eq", "id", DEBRIEF_ID]);
    expect(del.calls).toContainEqual(["eq", "user_id", USER_ID]);
  });
});

describe("practiceDebriefAction", () => {
  const SCENARIO = {
    title: "Returning a Jacket Without a Receipt",
    description: "Practice a return.",
    userRole: "Customer",
    aiRole: "Store Cashier",
    aiPersonality: "Busy",
    goal: "Get a refund.",
    difficulty: "upper_intermediate" as const,
    openingLine: null,
    estMinutes: 5,
  };
  const detail = (scenarioId: string | null) => ({
    id: DEBRIEF_ID,
    situation: "x",
    whatYouSaid: null,
    createdAt: "2026-11-03T10:00:00Z",
    scenarioId,
    sample: false,
    result: { situationSummary: "x", phrasings: [], explanation: "x", expressions: [], scenario: SCENARIO },
  });
  type Call = [string, ...unknown[]];

  function fake(opts: { count?: number; linked?: unknown[] } = {}) {
    const queries: { table: string; calls: Call[] }[] = [];
    const from = (table: string) => {
      const query = { table, calls: [] as Call[] };
      queries.push(query);
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "insert", "update", "delete", "eq", "is", "single"]) {
        builder[m] = (...args: unknown[]) => {
          query.calls.push([m, ...args]);
          return builder;
        };
      }
      const has = (m: string) => query.calls.some(([c]) => c === m);
      builder.then = (resolve: (v: unknown) => unknown) => {
        const result =
          table === "scenarios" && has("insert")
            ? { data: { id: "new-scenario" }, error: null }
            : table === "scenarios" && has("delete")
              ? { error: null }
              : table === "scenarios"
                ? { count: opts.count ?? 0, error: null }
                : { data: opts.linked ?? [{ scenario_id: "new-scenario" }], error: null };
        return Promise.resolve(result).then(resolve);
      };
      return builder;
    };
    return { client: { from }, queries };
  }
  const form = () => {
    const data = new FormData();
    data.set("debriefId", DEBRIEF_ID);
    return data;
  };
  const IDLE = { status: "idle" } as const;
  const find = (f: ReturnType<typeof fake>, table: string, method: string) =>
    f.queries.find((q) => q.table === table && q.calls.some(([m]) => m === method));

  it("creates the learner's own scenario from the debrief, links it and opens the brief", async () => {
    getDebrief.mockResolvedValue(detail(null));
    const f = fake();
    createClient.mockResolvedValue(f.client);

    expect(await redirectTarget(practiceDebriefAction(IDLE, form()))).toBe("/simulator/custom/new-scenario");
    const insert = find(f, "scenarios", "insert")!.calls.find(([m]) => m === "insert")![1];
    expect(insert).toMatchObject({
      title: SCENARIO.title,
      user_role: "Customer",
      ai_role: "Store Cashier",
      difficulty: "upper_intermediate",
      opening_line: null, // the AI's null opening line passes the custom-scenario check
      est_minutes: 5,
      category: "custom",
      is_custom: true,
      created_by: USER_ID,
    });
    const link = find(f, "debriefs", "update")!;
    expect(link.calls).toContainEqual(["update", { scenario_id: "new-scenario" }]);
    expect(link.calls).toContainEqual(["is", "scenario_id", null]);
    expect(link.calls).toContainEqual(["eq", "user_id", USER_ID]);
  });

  it("opens the existing scenario instead of creating another", async () => {
    getDebrief.mockResolvedValue(detail("existing"));
    const f = fake();
    createClient.mockResolvedValue(f.client);
    expect(await redirectTarget(practiceDebriefAction(IDLE, form()))).toBe("/simulator/custom/existing");
    expect(find(f, "scenarios", "insert")).toBeUndefined();
  });

  it("follows the winner when another click linked a scenario first, deleting its own copy", async () => {
    getDebrief.mockResolvedValueOnce(detail(null)).mockResolvedValueOnce(detail("winner"));
    const f = fake({ linked: [] });
    createClient.mockResolvedValue(f.client);
    expect(await redirectTarget(practiceDebriefAction(IDLE, form()))).toBe("/simulator/custom/winner");
    const del = find(f, "scenarios", "delete")!;
    expect(del.calls).toContainEqual(["eq", "id", "new-scenario"]);
  });

  it("respects the custom scenario limit and a missing debrief", async () => {
    getDebrief.mockResolvedValue(detail(null));
    const f = fake({ count: 50 });
    createClient.mockResolvedValue(f.client);
    expect(await practiceDebriefAction(IDLE, form())).toEqual({
      status: "error",
      message: "You can keep up to 50 scenarios. Delete one you no longer need first.",
    });
    expect(find(f, "scenarios", "insert")).toBeUndefined();

    getDebrief.mockResolvedValue(null);
    expect(await practiceDebriefAction(IDLE, form())).toEqual({
      status: "error",
      message: "This debrief no longer exists.",
    });
  });
});
