"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AIError } from "@/lib/ai/errors";
import { consumeAiQuota } from "@/lib/ai/quota";
import { reviewConversation } from "@/lib/ai/services/reviewer";
import { reviewFailure, SAVE_FAILED, type RunReviewResult } from "@/lib/actions/conversation-review-state";
import type { SaveItemState } from "@/lib/actions/studio-state";
import { getCurrentProfile, requireUser } from "@/lib/auth/dal";
import { getConversation } from "@/lib/data/conversations";
import type { Json } from "@/lib/supabase/types";
import { likeExact } from "@/lib/items";
import { createClient } from "@/lib/supabase/server";

const ClaimSchema = z.enum(["claimed", "in_progress", "completed", "active", "abandoned"]);

/**
 * Runs the review of an ended conversation (docs/ARCHITECTURE.md → Conversation state):
 * claim it (claim_conversation_review, so only one attempt runs), call the reviewer outside any
 * transaction, then write everything once with apply_conversation_review. A failure is recorded
 * as `failed_review` with its error code, and the learner can retry.
 */
export async function runReviewAction(conversationId: unknown): Promise<RunReviewResult> {
  const id = z.uuid().safeParse(conversationId);
  const user = await requireUser(id.success ? `/conversations/${id.data}/review` : "/conversations");
  if (!id.success) return { status: "missing" };
  const supabase = await createClient();
  if (!supabase)
    return {
      status: "failed",
      message: "Reviews need an account: Supabase is not configured.",
      canRetry: false,
    };

  const claim = await supabase.rpc("claim_conversation_review", { p_conversation_id: id.data });
  if (claim.error?.code === "P0002") return { status: "missing" };
  const claimed = ClaimSchema.safeParse(claim.data);
  if (claim.error || !claimed.success) {
    console.error("[review] claim failed", { code: claim.error?.code });
    return { status: "failed", ...reviewFailure(SAVE_FAILED) };
  }
  if (claimed.data !== "claimed") return { status: claimed.data };

  const fail = async (code: string): Promise<RunReviewResult> => {
    const { error } = await supabase
      .from("conversations")
      .update({ status: "failed_review", review_error: code })
      .eq("id", id.data)
      .eq("user_id", user.id)
      .eq("status", "reviewing");
    // If this fails too, the claim goes stale after 5 minutes and the review can be reclaimed.
    if (error) console.error("[review] marking the review failed failed", { code: error.code });
    return { status: "failed", ...reviewFailure(code) };
  };

  try {
    const [conversation, profile] = await Promise.all([
      getConversation(user.id, id.data),
      getCurrentProfile(),
    ]);
    if (!conversation?.scenario) return await fail("invalid_input");

    const { review } = await reviewConversation(
      {
        scenario: conversation.scenario,
        learner: {
          englishLevel: profile?.englishLevel ?? null,
          nativeLanguage: profile?.nativeLanguage ?? null,
        },
        targets: conversation.targets,
        messages: conversation.messages.map(({ id: messageId, role, content }) => ({
          id: messageId,
          role,
          content,
        })),
      },
      { consumeQuota: () => consumeAiQuota(supabase) },
    );

    const applied = await supabase.rpc("apply_conversation_review", {
      p_conversation_id: id.data,
      p_review: review as unknown as Json,
    });
    if (applied.error) {
      console.error("[review] apply failed", { code: applied.error.code });
      return await fail(SAVE_FAILED);
    }
    // false: another attempt completed it first; either way the review is there.
    return { status: "completed" };
  } catch (error) {
    if (error instanceof AIError) return await fail(error.code);
    console.error("[review] failed", { name: error instanceof Error ? error.name : "unknown" });
    return await fail(SAVE_FAILED);
  }
}

const SaveExpressionSchema = z.object({
  correctionId: z.uuid(),
  index: z.coerce.number().int().min(0).max(2),
});
const SavedExpressionsSchema = z.array(z.object({ expression: z.string(), meaning: z.string() }));
const SAVE_EXPRESSION_FAILED = "We couldn't save that. Please try again.";

/**
 * Saves one "expression worth saving" from a review to My English. The client sends only the
 * correction id and the expression's index; the text comes from the stored correction (RLS: the
 * learner's own), with the improved sentence as the example and links back to the conversation.
 */
export async function saveReviewExpressionAction(
  _prev: SaveItemState,
  formData: FormData,
): Promise<SaveItemState> {
  const parsed = SaveExpressionSchema.safeParse({
    correctionId: formData.get("correctionId"),
    index: formData.get("index"),
  });
  if (!parsed.success) return { status: "error", message: SAVE_EXPRESSION_FAILED };

  const user = await requireUser("/conversations");
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Saving needs an account: Supabase is not configured." };

  const { data: correction, error: readError } = await supabase
    .from("corrections")
    .select("id, conversation_id, original, improved, explanation, saveable_expressions")
    .eq("id", parsed.data.correctionId)
    .eq("user_id", user.id)
    .maybeSingle();
  const expressions = SavedExpressionsSchema.safeParse(correction?.saveable_expressions);
  const picked = expressions.success ? expressions.data[parsed.data.index] : undefined;
  if (readError || !correction || !picked || !picked.expression.trim()) {
    if (readError) console.error("[review] save expression lookup failed", { code: readError.code });
    return { status: "error", message: SAVE_EXPRESSION_FAILED };
  }

  const expression = picked.expression.trim().slice(0, 200);
  const { data, error } = await supabase
    .from("learning_items")
    .insert({
      user_id: user.id,
      type: "expression",
      expression,
      meaning: picked.meaning.trim().slice(0, 1000),
      example: correction.improved.slice(0, 1000),
      details: {
        review: {
          original: correction.original,
          improved: correction.improved,
          explanation: correction.explanation,
        },
      },
      source: "review",
      source_conversation_id: correction.conversation_id,
      source_correction_id: correction.id,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const { data: existing } = await supabase
      .from("learning_items")
      .select("id")
      .eq("user_id", user.id)
      .ilike("expression", likeExact(expression))
      .limit(1)
      .maybeSingle();
    if (existing) return { status: "saved", itemId: existing.id, alreadySaved: true };
  }
  if (error || !data) {
    console.error("[review] save expression failed", { code: error?.code });
    return { status: "error", message: SAVE_EXPRESSION_FAILED };
  }
  refresh();
  return { status: "saved", itemId: data.id, alreadySaved: false };
}
