import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { getSavedItem } = await import("@/lib/data/items");

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const ITEM_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
type Call = [string, ...unknown[]];

const ITEM = {
  id: ITEM_ID,
  type: "phrase",
  expression: "walk me through",
  meaning: "explain step by step",
  mastery_score: 0.3,
  review_count: 2,
  next_review_at: "2026-11-03T00:00:00Z",
  created_at: "2026-10-20T00:00:00Z",
  native_meaning: null,
  example: null,
  source: "review",
  interval_days: 3,
  ease: 2.5,
  last_reviewed_at: null,
  details: {},
  source_conversation_id: "c1",
  source_debrief_id: null,
};

function fake(usedCount: number) {
  const queries: { table: string; calls: Call[] }[] = [];
  const from = (table: string) => {
    const query = { table, calls: [] as Call[] };
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "maybeSingle"]) {
      builder[m] = (...args: unknown[]) => {
        query.calls.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        table === "learning_items"
          ? { data: ITEM, error: null }
          : { count: usedCount, data: null, error: null },
      ).then(resolve);
    return builder;
  };
  return { client: { from }, queries };
}

beforeEach(() => vi.clearAllMocks());

describe("getSavedItem", () => {
  it("counts conversations where the item was used naturally (Reuse), never a stored counter", async () => {
    const f = fake(2);
    createClient.mockResolvedValue(f.client);
    const item = await getSavedItem(USER_ID, ITEM_ID);
    expect(item).toMatchObject({ timesUsed: 2, sourceConversationId: "c1" });
    const usage = f.queries.find((q) => q.table === "conversation_targets")!;
    expect(usage.calls).toContainEqual(["eq", "item_id", ITEM_ID]);
    expect(usage.calls).toContainEqual(["eq", "used_naturally", true]);
    expect(usage.calls).toContainEqual(["eq", "user_id", USER_ID]);
  });
});
