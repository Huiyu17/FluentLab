import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { getFluencyProfile } = await import("@/lib/data/profile");
const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
type Call = [string, ...unknown[]];

const row = (conversationId: string, at: string, score: number, extra: Record<string, unknown> = {}) => ({
  conversation_id: conversationId,
  created_at: at,
  fluency_score: score,
  naturalness_score: score,
  grammar_score: score,
  vocabulary_score: score,
  confidence_score: score,
  conversations: { scenario_snapshot: { title: "Office Hours" } },
  ...extra,
});

function fake(feedback: unknown[], gaps: unknown[]) {
  const queries: { table: string; calls: Call[] }[] = [];
  const from = (table: string) => {
    const query = { table, calls: [] as Call[] };
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) {
      builder[m] = (...args: unknown[]) => {
        query.calls.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: table === "conversation_feedback" ? feedback : gaps, error: null }).then(
        resolve,
      );
    return builder;
  };
  return { client: { from }, queries };
}

beforeEach(() => vi.clearAllMocks());

describe("getFluencyProfile", () => {
  it("returns the history oldest first, skipping malformed rows, plus gap counts", async () => {
    const f = fake(
      [
        row("c3", "2026-10-30T10:00:00Z", 70),
        row("bad", "2026-10-29T10:00:00Z", 70, { grammar_score: 140 }),
        row("c1", "2026-10-28T10:00:00Z", 60),
      ],
      [{ status: "active" }, { status: "active" }, { status: "resolved" }],
    );
    createClient.mockResolvedValue(f.client);

    const profile = await getFluencyProfile(USER_ID);
    expect(profile?.points.map((p) => [p.conversationId, p.scores.fluency])).toEqual([
      ["c1", 60],
      ["c3", 70],
    ]);
    // An incomplete snapshot falls back to a generic title.
    expect(profile?.points[0]?.title).toBe("Conversation");
    expect(profile?.gaps).toEqual({ active: 2, improving: 0, resolved: 1 });
    expect(f.queries[0]!.calls).toContainEqual(["eq", "user_id", USER_ID]);
    expect(f.queries[1]!.calls).toContainEqual(["eq", "user_id", USER_ID]);
  });
});
