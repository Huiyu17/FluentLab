import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const ITEM_ID = "1b2c3d4e-5f60-4a1b-8c2d-3e4f5a6b7c8d";

const requireUser = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: (next?: string) => requireUser(next) }));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { recordReviewAction } = await import("@/lib/actions/review");

const ROW = {
  applied: true,
  review_count: 3,
  interval_days: 7,
  ease: 2.5,
  mastery_score: 0.3,
  next_review_at: "2026-11-05T12:00:00Z",
};

function client(result: { data?: unknown; error?: { code: string } | null }) {
  const rpc = vi.fn(async () => ({ data: null, error: null, ...result }));
  return { rpc };
}

const INPUT = { itemId: ITEM_ID, rating: "good", mode: "recall", expectedReviewCount: 2 };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireUser.mockReset().mockResolvedValue({ id: USER_ID, email: null });
  createClient.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("recordReviewAction", () => {
  it("calls record_item_review with the expected count and returns the new state", async () => {
    const fake = client({ data: [ROW] });
    createClient.mockResolvedValue(fake);

    expect(await recordReviewAction(INPUT)).toEqual({
      status: "recorded",
      applied: true,
      state: {
        ease: 2.5,
        intervalDays: 7,
        masteryScore: 0.3,
        reviewCount: 3,
        nextReviewAt: "2026-11-05T12:00:00Z",
      },
    });
    expect(fake.rpc).toHaveBeenCalledWith("record_item_review", {
      p_item_id: ITEM_ID,
      p_rating: "good",
      p_mode: "recall",
      p_expected_review_count: 2,
    });
    expect(requireUser).toHaveBeenCalledWith("/my-english/review");
  });

  it("passes through a repeated submit as applied = false", async () => {
    createClient.mockResolvedValue(client({ data: [{ ...ROW, applied: false }] }));
    expect(await recordReviewAction(INPUT)).toMatchObject({ status: "recorded", applied: false });
  });

  it("reports a deleted or foreign item as missing", async () => {
    createClient.mockResolvedValue(client({ error: { code: "P0002" } }));
    expect(await recordReviewAction(INPUT)).toEqual({ status: "missing" });
  });

  it("rejects invalid input before touching the database", async () => {
    for (const bad of [
      { ...INPUT, itemId: "nope" },
      { ...INPUT, rating: "perfect" },
      { ...INPUT, mode: "conversation" },
      { ...INPUT, expectedReviewCount: -1 },
      "not an object",
    ]) {
      expect(await recordReviewAction(bad)).toMatchObject({ status: "error" });
    }
    expect(createClient).not.toHaveBeenCalled();
  });

  it("logs only the error code on failure", async () => {
    createClient.mockResolvedValue(client({ error: { code: "57014" } }));
    expect(await recordReviewAction(INPUT)).toMatchObject({ status: "error" });
    expect(console.error).toHaveBeenCalledWith("[review] record failed", { code: "57014" });
  });
});
