import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { getTodayData } = await import("@/lib/data/today");

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const NOW = new Date("2026-10-28T20:00:00Z"); // Wed 4pm in New York
const PROFILE = { contexts: ["campus" as const], dailyGoalMinutes: 20, timezone: "America/New_York" };

type Call = [method: string, ...args: unknown[]];
type Query = { table: string; calls: Call[] };
type Result = { data?: unknown; count?: number | null; error?: { code: string } | null };

/**
 * Chainable stand-in for the PostgREST query builder. Every query is recorded, and
 * `respond` picks the result from the table and the calls made on it.
 */
function fakeSupabase(respond: (query: Query) => Result) {
  const queries: Query[] = [];
  const from = (table: string) => {
    const query: Query = { table, calls: [] };
    queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "lte", "gt", "gte", "order", "limit"]) {
      builder[method] = (...args: unknown[]) => {
        query.calls.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown) => {
      const result = respond(query);
      return Promise.resolve({ data: null, count: null, error: null, ...result }).then(resolve);
    };
    return builder;
  };
  return { client: { from }, queries };
}

const has = (query: Query, method: string) => query.calls.some(([m]) => m === method);
const selected = (query: Query) => String(query.calls.find(([m]) => m === "select")?.[1] ?? "");

const SCENARIOS = [
  { slug: "office-hours", title: "Office Hours", category: "campus", est_minutes: 8 },
  { slug: "after-class-small-talk", title: "Chatting After Class", category: "campus", est_minutes: 6 },
  {
    slug: "coffee-shop-order",
    title: "Ordering at a Busy Coffee Shop",
    category: "everyday",
    est_minutes: 5,
  },
];

function gapRow(overrides: Record<string, unknown>) {
  return {
    id: "gap",
    title: "Gap",
    description: "",
    status: "active",
    severity: "medium",
    evidence_count: 2,
    conversations_count: 1,
    last_detected_at: "2026-10-27T10:00:00Z",
    created_at: "2026-10-20T10:00:00Z",
    ...overrides,
  };
}

/** A new learner: nothing saved, practiced or reviewed yet. */
function emptyAccount(query: Query): Result {
  if (query.table === "scenarios") return { data: SCENARIOS };
  if (has(query, "select") && query.calls.some(([m, , opts]) => m === "select" && opts)) return { count: 0 };
  return { data: [] };
}

beforeEach(() => {
  createClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("getTodayData", () => {
  it("returns null when Supabase is not configured", async () => {
    createClient.mockResolvedValue(null);
    expect(await getTodayData(USER_ID, PROFILE, NOW)).toBeNull();
  });

  it("gives a new learner a plan and empty sections", async () => {
    const fake = fakeSupabase(emptyAccount);
    createClient.mockResolvedValue(fake.client);

    const data = await getTodayData(USER_ID, PROFILE, NOW);

    expect(data).toMatchObject({
      today: "2026-10-28",
      dailyGoalMinutes: 20,
      reviews: { dueCount: 0, totalCount: 0, nextDueAt: null },
      focusGaps: [],
      openGapCount: 0,
      recentActivity: [],
      indicators: null,
      streak: { current: 0, practicedToday: false },
    });
    expect(data?.plan.map((r) => r.kind)).toEqual(["conversation", "studio"]);
    expect(data?.planMinutes).toBe(data!.plan.reduce((sum, r) => sum + r.minutes, 0));
  });

  it("scopes every user-owned query to the signed-in user", async () => {
    const fake = fakeSupabase(emptyAccount);
    createClient.mockResolvedValue(fake.client);
    await getTodayData(USER_ID, PROFILE, NOW);

    for (const query of fake.queries) {
      if (query.table === "scenarios") {
        expect(query.calls).toContainEqual(["eq", "is_custom", false]);
      } else {
        expect(query.calls, query.table).toContainEqual(["eq", "user_id", USER_ID]);
      }
    }
    const gaps = fake.queries.find((q) => q.table === "language_gaps")!;
    expect(gaps.calls).toContainEqual(["in", "status", ["active", "improving"]]);
  });

  it("assembles reviews, gaps, activity, streak and indicators", async () => {
    const fake = fakeSupabase((query) => {
      switch (query.table) {
        case "learning_items":
          if (has(query, "lte")) return { count: 4 };
          if (has(query, "gt")) return { data: [{ next_review_at: "2026-10-29T09:00:00Z" }] };
          return { count: 10 };
        case "language_gaps":
          return {
            data: [
              gapRow({ id: "low", severity: "low", evidence_count: 9 }),
              gapRow({ id: "high", title: "Overly direct requests", severity: "high", evidence_count: 5 }),
              gapRow({ id: "medium", severity: "medium" }),
              gapRow({ id: "medium-old", severity: "medium", last_detected_at: null }),
              gapRow({ id: "bad", severity: "critical" }),
            ],
          };
        case "scenarios":
          return { data: [...SCENARIOS, { slug: "x", title: "X", category: "space", est_minutes: 5 }] };
        case "conversations":
          if (selected(query).includes("scenario_snapshot")) {
            return {
              data: [
                {
                  id: "c2",
                  status: "completed",
                  started_at: "2026-10-28T13:00:00Z",
                  completed_at: "2026-10-28T13:10:00Z",
                  overall_score: 72,
                  scenario_snapshot: {},
                  scenarios: { slug: "office-hours", title: "Office Hours" },
                },
                {
                  id: "c1",
                  status: "abandoned",
                  started_at: "2026-10-26T13:00:00Z",
                  completed_at: null,
                  overall_score: null,
                  scenario_snapshot: { title: "Deleted Scenario" },
                  scenarios: null,
                },
              ],
            };
          }
          return { data: [{ completed_at: "2026-10-28T13:10:00Z" }] };
        case "debriefs":
          return {
            data: [{ id: "d1", situation: "A".repeat(120), created_at: "2026-10-27T15:00:00Z" }],
          };
        case "review_logs":
          return { data: [{ created_at: "2026-10-26T15:00:00Z" }] };
        case "conversation_feedback":
          return {
            data: [
              {
                conversation_id: "c2",
                created_at: "2026-10-28T13:12:00Z",
                overall_label: "developing",
                fluency_score: 70,
                naturalness_score: 61,
                grammar_score: 82,
                vocabulary_score: 66,
                confidence_score: 58,
              },
            ],
          };
        default:
          throw new Error(`Unexpected table ${query.table}`);
      }
    });
    createClient.mockResolvedValue(fake.client);

    const data = (await getTodayData(USER_ID, PROFILE, NOW))!;

    expect(data.reviews).toEqual({ dueCount: 4, totalCount: 10, nextDueAt: "2026-10-29T09:00:00Z" });

    // Invalid rows are dropped; the rest are ranked and capped.
    expect(data.openGapCount).toBe(4);
    expect(data.focusGaps.map((g) => g.id)).toEqual(["high", "medium", "medium-old"]);
    expect(data.focusGaps[2]?.lastDetectedAt).toBe("2026-10-20T10:00:00Z");

    expect(data.plan.map((r) => r.kind)).toEqual(["conversation", "review", "studio"]);
    const conversation = data.plan[0];
    expect(conversation).toMatchObject({
      gapId: "high",
      reason: 'Practice "Overly direct requests": seen 5× in your conversations.',
    });
    // Office Hours was just practiced, so the other campus scenario comes up.
    expect(conversation).toMatchObject({ scenarioSlug: "after-class-small-talk" });

    // Conversation today, debrief yesterday, review the day before (New York time).
    expect(data.streak).toMatchObject({ current: 3, practicedToday: true });

    expect(data.recentActivity).toEqual([
      {
        kind: "conversation",
        id: "c2",
        title: "Office Hours",
        status: "completed",
        at: "2026-10-28T13:10:00Z",
        score: 72,
        href: "/conversations/c2/review",
      },
      {
        kind: "debrief",
        id: "d1",
        title: `${"A".repeat(79)}…`,
        at: "2026-10-27T15:00:00Z",
        href: "/debrief/d1",
      },
      {
        kind: "conversation",
        id: "c1",
        title: "Deleted Scenario",
        status: "abandoned",
        at: "2026-10-26T13:00:00Z",
        score: null,
        href: "/conversations/c1",
      },
    ]);

    expect(data.indicators).toEqual({
      conversationId: "c2",
      at: "2026-10-28T13:12:00Z",
      overallLabel: "developing",
      scores: { fluency: 70, naturalness: 61, grammar: 82, vocabulary: 66, confidence: 58 },
    });
  });

  it("throws on a query error and logs only the error code", async () => {
    const fake = fakeSupabase((query) =>
      query.table === "language_gaps" ? { error: { code: "42501" } } : emptyAccount(query),
    );
    createClient.mockResolvedValue(fake.client);

    await expect(getTodayData(USER_ID, PROFILE, NOW)).rejects.toThrow("Could not load gaps.");
    expect(console.error).toHaveBeenCalledWith("[today] gaps query failed", { code: "42501" });
  });

  it("leaves indicators out when the feedback row is malformed", async () => {
    const fake = fakeSupabase((query) =>
      query.table === "conversation_feedback"
        ? { data: [{ conversation_id: "c", created_at: "2026-10-28T00:00:00Z", overall_label: "CEFR C1" }] }
        : emptyAccount(query),
    );
    createClient.mockResolvedValue(fake.client);
    expect((await getTodayData(USER_ID, PROFILE, NOW))?.indicators).toBeNull();
  });
});
