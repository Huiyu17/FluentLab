import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { getGap, listGaps } = await import("@/lib/data/gaps");

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const GAP_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
type Call = [string, ...unknown[]];

function fake(results: Record<string, unknown>) {
  const queries: { table: string; calls: Call[] }[] = [];
  const from = (table: string) => {
    const query = { table, calls: [] as Call[] };
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "gte", "in", "order", "limit", "maybeSingle"]) {
      builder[m] = (...args: unknown[]) => {
        query.calls.push([m, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: results[table] ?? null, error: null }).then(resolve);
    return builder;
  };
  return { client: { from }, queries };
}

const gapRow = (overrides: Record<string, unknown> = {}) => ({
  id: GAP_ID,
  title: "Articles",
  description: "Using a, an, the.",
  status: "active",
  severity: "low",
  evidence_count: 2,
  conversations_count: 1,
  last_detected_at: "2026-10-28T12:00:00Z",
  first_detected_at: "2026-10-20T12:00:00Z",
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe("listGaps", () => {
  it("leaves out emerging gaps and sorts by severity, then most recent", async () => {
    const f = fake({
      language_gaps: [
        gapRow({ id: "low-old", severity: "low", last_detected_at: "2026-10-01T00:00:00Z" }),
        gapRow({ id: "high", severity: "high" }),
        gapRow({ id: "low-new", severity: "low", last_detected_at: "2026-10-28T00:00:00Z" }),
        gapRow({ id: "weird", status: "emerging" }), // filtered by the query; ignored if it slips through
      ],
    });
    createClient.mockResolvedValue(f.client);
    const gaps = await listGaps(USER_ID);
    expect(gaps?.map((g) => g.id)).toEqual(["high", "low-new", "low-old"]);
    expect(f.queries[0]!.calls).toContainEqual(["neq", "status", "emerging"]);
    expect(f.queries[0]!.calls).toContainEqual(["eq", "user_id", USER_ID]);
  });
});

describe("getGap", () => {
  it("splits evidence from good usages and names the conversations", async () => {
    const f = fake({
      language_gaps: gapRow(),
      language_events: [
        {
          id: "e1",
          event_type: "grammar_error",
          original: "the homework 3",
          suggestion: "Homework 3",
          context: "office hours",
          created_at: "2026-10-28T12:00:00Z",
          conversation_id: "c1",
        },
        {
          id: "e2",
          event_type: "good_usage",
          original: "a question",
          suggestion: null,
          context: "",
          created_at: "2026-10-27T12:00:00Z",
          conversation_id: "c2",
        },
      ],
      conversations: [
        { id: "c1", scenario_snapshot: { title: "Office Hours" } }, // incomplete snapshot → fallback title
        {
          id: "c2",
          scenario_snapshot: {
            scenarioId: null,
            slug: "small-talk",
            isCustom: false,
            category: "social",
            title: "Small talk",
            description: "",
            userRole: "",
            aiRole: "",
            aiPersonality: "",
            goal: "",
            difficulty: "intermediate",
            openingLine: null,
            estMinutes: 5,
          },
        },
      ],
    });
    createClient.mockResolvedValue(f.client);

    const gap = await getGap(USER_ID, GAP_ID);
    expect(gap).toMatchObject({ id: GAP_ID, status: "active", firstDetectedAt: "2026-10-20T12:00:00Z" });
    expect(gap?.evidence).toEqual([expect.objectContaining({ id: "e1", conversationTitle: "Conversation" })]);
    expect(gap?.goodUsages).toEqual([expect.objectContaining({ id: "e2", conversationTitle: "Small talk" })]);

    const events = f.queries.find((q) => q.table === "language_events")!;
    expect(events.calls).toContainEqual(["gte", "confidence", 0.6]);
    expect(events.calls).toContainEqual(["eq", "gap_id", GAP_ID]);
    expect(f.queries.find((q) => q.table === "conversations")!.calls).toContainEqual([
      "in",
      "id",
      ["c1", "c2"],
    ]);
  });

  it("returns null for emerging, missing or malformed gaps", async () => {
    createClient.mockResolvedValue(
      fake({ language_gaps: gapRow({ status: "emerging" }), language_events: [] }).client,
    );
    expect(await getGap(USER_ID, GAP_ID)).toBeNull();
    createClient.mockResolvedValue(fake({ language_gaps: null, language_events: [] }).client);
    expect(await getGap(USER_ID, GAP_ID)).toBeNull();
    expect(await getGap(USER_ID, "nope")).toBeNull();
  });
});
