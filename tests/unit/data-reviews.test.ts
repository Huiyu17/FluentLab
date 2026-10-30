import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { getConversationPatterns } = await import("@/lib/data/reviews");

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const CONVERSATION_ID = "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c";
type Call = [string, ...unknown[]];

function fake(events: unknown[], gaps: unknown[]) {
  const queries: { table: string; calls: Call[] }[] = [];
  const from = (table: string) => {
    const query = { table, calls: [] as Call[] };
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "not", "in"]) {
      builder[m] = (...args: unknown[]) => {
        query.calls.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: table === "language_events" ? events : gaps, error: null }).then(resolve);
    return builder;
  };
  return { client: { from }, queries };
}

beforeEach(() => vi.clearAllMocks());

describe("getConversationPatterns", () => {
  it("counts this conversation's evidence per gap, most issues first", async () => {
    const f = fake(
      [
        { gap_id: "g1", event_type: "grammar_error", confidence: 0.9 },
        { gap_id: "g2", event_type: "overly_direct", confidence: 0.7 },
        { gap_id: "g2", event_type: "missed_opportunity", confidence: 0.8 },
        { gap_id: "g3", event_type: "good_usage", confidence: 0.8 },
      ],
      [
        { id: "g1", title: "Articles", status: "active" },
        { id: "g2", title: "Polite requests", status: "emerging" },
        { id: "g3", title: "Small talk", status: "improving" },
      ],
    );
    createClient.mockResolvedValue(f.client);

    expect(await getConversationPatterns(USER_ID, CONVERSATION_ID)).toEqual([
      { gapId: "g2", title: "Polite requests", status: "emerging", issues: 2, goodUses: 0 },
      { gapId: "g1", title: "Articles", status: "active", issues: 1, goodUses: 0 },
      { gapId: "g3", title: "Small talk", status: "improving", issues: 0, goodUses: 1 },
    ]);
    const events = f.queries[0]!;
    expect(events.calls).toContainEqual(["eq", "conversation_id", CONVERSATION_ID]);
    expect(events.calls).toContainEqual(["eq", "user_id", USER_ID]);
    // Low-confidence events are stored but aren't evidence.
    expect(events.calls).toContainEqual(["gte", "confidence", 0.6]);
    expect(f.queries[1]!.calls).toContainEqual(["in", "id", ["g1", "g2", "g3"]]);
  });

  it("skips the gaps query when there is no evidence", async () => {
    const f = fake([], []);
    createClient.mockResolvedValue(f.client);
    expect(await getConversationPatterns(USER_ID, CONVERSATION_ID)).toEqual([]);
    expect(f.queries).toHaveLength(1);
  });
});
