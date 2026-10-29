import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_SCENARIO_STATE } from "@/lib/actions/scenario-state";

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
const OTHER_ID = "9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a";
const SCENARIO_ID = "3d4e5f60-7182-4c3d-8e4f-5a6b7c8d9e0f";

const requireUser = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: (next?: string) => requireUser(next) }));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { createScenarioAction, deleteScenarioAction, updateScenarioAction } =
  await import("@/lib/actions/scenario");

type Call = [method: string, ...args: unknown[]];
type Result = { data?: unknown; count?: number | null; error?: { code: string } | null };

function fakeSupabase(respond: (calls: Call[]) => Result) {
  const queries: Call[][] = [];
  const from = () => {
    const calls: Call[] = [];
    queries.push(calls);
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "insert", "update", "delete", "eq", "single"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, count: null, error: null, ...respond(calls) }).then(resolve);
    return builder;
  };
  return { client: { from }, queries };
}

const has = (calls: Call[], method: string) => calls.some(([m]) => m === method);
const arg = (calls: Call[], method: string) =>
  calls.find(([m]) => m === method)?.[1] as Record<string, unknown>;

function form(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    title: "Lab meeting update",
    description: "",
    userRole: "A first-year PhD student",
    aiRole: "My advisor, Dr. Chen",
    aiPersonality: "",
    goal: "Ask for one more week.",
    difficulty: "advanced",
    openingLine: "",
    estMinutes: "10",
    ...overrides,
  };
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
  requireUser.mockReset().mockResolvedValue({ id: USER_ID, email: null });
  createClient.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("createScenarioAction", () => {
  it("saves a custom scenario owned by the signed-in user and opens its brief", async () => {
    const fake = fakeSupabase((calls) =>
      has(calls, "insert") ? { data: { id: SCENARIO_ID } } : { count: 2 },
    );
    createClient.mockResolvedValue(fake.client);

    // A forged owner or category in the form must be ignored.
    const target = await redirectTarget(
      createScenarioAction(
        IDLE_SCENARIO_STATE,
        form({ created_by: OTHER_ID, category: "campus", is_custom: "false" }),
      ),
    );
    expect(target).toBe(`/simulator/custom/${SCENARIO_ID}`);

    const insert = fake.queries.find((calls) => has(calls, "insert"))!;
    expect(arg(insert, "insert")).toEqual({
      title: "Lab meeting update",
      description: "",
      user_role: "A first-year PhD student",
      ai_role: "My advisor, Dr. Chen",
      ai_personality: "",
      goal: "Ask for one more week.",
      difficulty: "advanced",
      opening_line: null,
      est_minutes: 10,
      category: "custom",
      is_custom: true,
      created_by: USER_ID,
    });
  });

  it("returns field errors without touching the database", async () => {
    const state = await createScenarioAction(
      IDLE_SCENARIO_STATE,
      form({ title: "", goal: " ", difficulty: "C2" }),
    );
    expect(state).toEqual({
      status: "error",
      fieldErrors: {
        title: "Give your scenario a short title.",
        goal: "What do you want to get out of the conversation?",
        difficulty: "Choose a difficulty.",
      },
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("stops at the per-account limit", async () => {
    const fake = fakeSupabase(() => ({ count: 50 }));
    createClient.mockResolvedValue(fake.client);
    expect(await createScenarioAction(IDLE_SCENARIO_STATE, form())).toMatchObject({
      status: "error",
      message: expect.stringContaining("up to 50 scenarios"),
    });
    expect(fake.queries.some((calls) => has(calls, "insert"))).toBe(false);
    expect(fake.queries[0]).toContainEqual(["eq", "created_by", USER_ID]);
  });

  it("checks the session first", async () => {
    requireUser.mockRejectedValue(new RedirectError("/login?next=%2Fsimulator%2Fcustom"));
    expect(await redirectTarget(createScenarioAction(IDLE_SCENARIO_STATE, form()))).toBe(
      "/login?next=%2Fsimulator%2Fcustom",
    );
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("updateScenarioAction", () => {
  it("updates only the owner's custom scenario, never ownership columns", async () => {
    const fake = fakeSupabase(() => ({ data: [{ id: SCENARIO_ID }] }));
    createClient.mockResolvedValue(fake.client);

    const target = await redirectTarget(
      updateScenarioAction(IDLE_SCENARIO_STATE, form({ id: SCENARIO_ID, title: "Renamed" })),
    );
    expect(target).toBe(`/simulator/custom/${SCENARIO_ID}`);

    const update = fake.queries[0]!;
    expect(arg(update, "update")).toMatchObject({ title: "Renamed" });
    for (const column of ["created_by", "is_custom", "category", "system_prompt"]) {
      expect(arg(update, "update"), column).not.toHaveProperty(column);
    }
    expect(update).toContainEqual(["eq", "id", SCENARIO_ID]);
    expect(update).toContainEqual(["eq", "created_by", USER_ID]);
    expect(update).toContainEqual(["eq", "is_custom", true]);
  });

  it("reports a scenario that no longer exists (or isn't theirs)", async () => {
    createClient.mockResolvedValue(fakeSupabase(() => ({ data: [] })).client);
    expect(await updateScenarioAction(IDLE_SCENARIO_STATE, form({ id: SCENARIO_ID }))).toEqual({
      status: "error",
      message: "This scenario no longer exists.",
    });
  });

  it("rejects a malformed id", async () => {
    expect(await updateScenarioAction(IDLE_SCENARIO_STATE, form({ id: "1; drop table" }))).toMatchObject({
      status: "error",
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("deleteScenarioAction", () => {
  it("deletes only the owner's custom scenario and returns to the catalog", async () => {
    const fake = fakeSupabase(() => ({}));
    createClient.mockResolvedValue(fake.client);
    const data = new FormData();
    data.set("id", SCENARIO_ID);

    expect(await redirectTarget(deleteScenarioAction(data))).toBe("/simulator");
    const del = fake.queries[0]!;
    expect(has(del, "delete")).toBe(true);
    expect(del).toContainEqual(["eq", "id", SCENARIO_ID]);
    expect(del).toContainEqual(["eq", "created_by", USER_ID]);
    expect(del).toContainEqual(["eq", "is_custom", true]);
  });
});
