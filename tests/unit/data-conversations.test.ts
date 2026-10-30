import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { HISTORY_PAGE_SIZE, listConversations } = await import("@/lib/data/conversations");

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
type Call = [string, ...unknown[]];

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
  goal: "Ask.",
  difficulty: "intermediate",
  openingLine: null,
  estMinutes: 8,
});

function fake(conversations: unknown[], messages: { conversation_id: string }[] = []) {
  const queries: { table: string; calls: Call[] }[] = [];
  const from = (table: string) => {
    const query = { table, calls: [] as Call[] };
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "lt", "order", "limit"]) {
      builder[m] = (...args: unknown[]) => {
        query.calls.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: table === "conversations" ? conversations : messages, error: null }).then(
        resolve,
      );
    return builder;
  };
  return { client: { from }, queries };
}

const row = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `c${i}`,
  status: "completed",
  scenario_snapshot: snapshot(`Scenario ${i}`),
  started_at: `2026-10-${String(29 - (i % 28)).padStart(2, "0")}T12:00:00+00:00`,
  conversation_feedback: [],
  ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe("listConversations", () => {
  it("returns titles, statuses, learner turns and labels, newest first", async () => {
    const f = fake(
      [
        row(1, { conversation_feedback: [{ overall_label: "developing" }] }),
        row(2, { status: "failed_review" }),
        row(3, {
          status: "weird",
          scenario_snapshot: {},
          conversation_feedback: [{ overall_label: "nope" }],
        }),
      ],
      [{ conversation_id: "c1" }, { conversation_id: "c1" }, { conversation_id: "c2" }],
    );
    createClient.mockResolvedValue(f.client);

    const result = await listConversations(USER_ID);
    expect(result?.conversations).toEqual([
      expect.objectContaining({
        id: "c1",
        status: "completed",
        title: "Scenario 1",
        turns: 2,
        overallLabel: "developing",
      }),
      expect.objectContaining({ id: "c2", status: "failed_review", turns: 1, overallLabel: null }),
      expect.objectContaining({
        id: "c3",
        status: "active",
        title: "Conversation",
        turns: 0,
        overallLabel: null,
      }),
    ]);
    expect(result?.nextBefore).toBeNull();

    const [conversations, messages] = f.queries;
    expect(conversations!.calls).toContainEqual(["eq", "user_id", USER_ID]);
    expect(conversations!.calls).toContainEqual(["order", "started_at", { ascending: false }]);
    expect(conversations!.calls).toContainEqual(["limit", HISTORY_PAGE_SIZE + 1]);
    expect(messages!.calls).toContainEqual(["eq", "role", "user"]);
    expect(messages!.calls).toContainEqual(["in", "conversation_id", ["c1", "c2", "c3"]]);
  });

  it("pages with a started_at cursor", async () => {
    const rows = Array.from({ length: HISTORY_PAGE_SIZE + 1 }, (_, i) => row(i));
    const f = fake(rows);
    createClient.mockResolvedValue(f.client);

    const result = await listConversations(USER_ID, "2026-10-29T00:00:00Z");
    expect(result?.conversations).toHaveLength(HISTORY_PAGE_SIZE);
    expect(result?.nextBefore).toBe(rows[HISTORY_PAGE_SIZE - 1]!.started_at);
    expect(f.queries[0]!.calls).toContainEqual(["lt", "started_at", "2026-10-29T00:00:00Z"]);
  });

  it("skips the turns query for an empty page and returns null without Supabase", async () => {
    const f = fake([]);
    createClient.mockResolvedValue(f.client);
    expect(await listConversations(USER_ID)).toEqual({ conversations: [], nextBefore: null });
    expect(f.queries).toHaveLength(1);

    createClient.mockResolvedValue(null);
    expect(await listConversations(USER_ID)).toBeNull();
  });
});
