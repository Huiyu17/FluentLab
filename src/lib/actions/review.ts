"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { REVIEW_RATINGS } from "@/lib/domain/scheduling";
import { createClient } from "@/lib/supabase/server";

const ReviewInputSchema = z.object({
  itemId: z.uuid(),
  rating: z.enum(REVIEW_RATINGS),
  mode: z.enum(["recall", "use_in_sentence"]),
  expectedReviewCount: z.number().int().min(0),
});

export type ReviewedState = {
  ease: number;
  intervalDays: number;
  masteryScore: number;
  reviewCount: number;
  nextReviewAt: string;
};

export type RecordReviewResult =
  | { status: "recorded"; applied: boolean; state: ReviewedState }
  | { status: "missing" }
  | { status: "error"; message: string };

const FAILED = "We couldn't save that answer. Please try again.";

/**
 * Records one answer through record_item_review(), which owns the scheduling rules. A repeated
 * submit (stale expectedReviewCount) comes back with applied = false and the current state.
 */
export async function recordReviewAction(input: unknown): Promise<RecordReviewResult> {
  const parsed = ReviewInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: FAILED };

  await requireUser("/my-english/review");
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Reviews need an account: Supabase is not configured." };

  const { itemId, rating, mode, expectedReviewCount } = parsed.data;
  const { data, error } = await supabase.rpc("record_item_review", {
    p_item_id: itemId,
    p_rating: rating,
    p_mode: mode,
    p_expected_review_count: expectedReviewCount,
  });

  // Deleted in another tab, or not the learner's (the RPC doesn't tell them apart).
  if (error?.code === "P0002") return { status: "missing" };
  const row = data?.[0];
  if (error || !row) {
    console.error("[review] record failed", { code: error?.code });
    return { status: "error", message: FAILED };
  }
  return {
    status: "recorded",
    applied: row.applied,
    state: {
      ease: row.ease,
      intervalDays: row.interval_days,
      masteryScore: row.mastery_score,
      reviewCount: row.review_count,
      nextReviewAt: row.next_review_at,
    },
  };
}
