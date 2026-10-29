import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { getCustomScenario, getSharedScenario, listScenarios } = await import("@/lib/data/scenarios");

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const SCENARIO_ID = "3d4e5f60-7182-4c3d-8e4f-5a6b7c8d9e0f";

type Call = [method: string, ...args: unknown[]];

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: SCENARIO_ID,
    slug: "office-hours",
    category: "campus",
    title: "Office Hours",
    description: "Visiting your professor.",
    user_role: "A student",
    ai_role: "Professor Lee",
    ai_personality: "Friendly but busy",
    goal: "Ask for clarification.",
    difficulty: "intermediate",
    opening_line: "Hey! Come on in.",
    est_minutes: 8,
    is_custom: false,
    ...overrides,
  };
}

function fakeSupabase(respond: (calls: Call[]) => { data?: unknown; error?: { code: string } | null }) {
  const queries: Call[][] = [];
  const from = () => {
    const calls: Call[] = [];
    queries.push(calls);
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "maybeSingle"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null, ...respond(calls) }).then(resolve);
    return builder;
  };
  return { client: { from }, queries };
}

const isCustomQuery = (calls: Call[]) => calls.some(([m, col, v]) => m === "eq" && col === "is_custom" && v);

beforeEach(() => {
  createClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("scenarios data", () => {
  it("lists the shared catalog and only the learner's own custom scenarios", async () => {
    const fake = fakeSupabase((calls) =>
      isCustomQuery(calls)
        ? { data: [row({ slug: null, category: "custom", is_custom: true, title: "Mine" })] }
        : { data: [row(), row({ id: "x", category: "space" })] },
    );
    createClient.mockResolvedValue(fake.client);

    const result = await listScenarios(USER_ID);
    expect(result?.shared.map((s) => s.title)).toEqual(["Office Hours"]); // invalid row dropped
    expect(result?.custom).toMatchObject([{ title: "Mine", isCustom: true, slug: null }]);
    const custom = fake.queries.find(isCustomQuery)!;
    expect(custom).toContainEqual(["eq", "created_by", USER_ID]);
  });

  it("never selects system_prompt", async () => {
    const fake = fakeSupabase(() => ({ data: row() }));
    createClient.mockResolvedValue(fake.client);
    await getSharedScenario("office-hours");
    const select = fake.queries[0]!.find(([m]) => m === "select");
    expect(String(select?.[1])).not.toContain("system_prompt");
  });

  it("maps a shared scenario by slug and rejects malformed slugs without a query", async () => {
    const fake = fakeSupabase(() => ({ data: row() }));
    createClient.mockResolvedValue(fake.client);
    expect(await getSharedScenario("office-hours")).toMatchObject({
      slug: "office-hours",
      userRole: "A student",
      aiRole: "Professor Lee",
      openingLine: "Hey! Come on in.",
      estMinutes: 8,
    });
    expect(await getSharedScenario("Office Hours")).toBeNull();
    expect(await getSharedScenario("../etc")).toBeNull();
    expect(fake.queries).toHaveLength(1);
  });

  it("scopes a custom scenario to its owner and rejects malformed ids", async () => {
    const fake = fakeSupabase(() => ({ data: null }));
    createClient.mockResolvedValue(fake.client);
    expect(await getCustomScenario(USER_ID, SCENARIO_ID)).toBeNull();
    expect(fake.queries[0]).toContainEqual(["eq", "created_by", USER_ID]);
    expect(fake.queries[0]).toContainEqual(["eq", "is_custom", true]);
    expect(await getCustomScenario(USER_ID, "not-a-uuid")).toBeNull();
    expect(fake.queries).toHaveLength(1);
  });

  it("throws on query errors, logging only the code", async () => {
    createClient.mockResolvedValue(fakeSupabase(() => ({ error: { code: "42501" } })).client);
    await expect(getSharedScenario("office-hours")).rejects.toThrow("Could not load scenario.");
    expect(console.error).toHaveBeenCalledWith("[scenarios] scenario failed", { code: "42501" });
  });
});
