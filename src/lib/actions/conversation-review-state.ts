import { AI_ERROR_CODES, AI_ERROR_MESSAGES, type AIErrorCode } from "@/lib/ai/errors";

/** Stored in conversations.review_error when the review couldn't be saved (not an AI failure). */
export const SAVE_FAILED = "save_failed";

export type RunReviewResult =
  /** The review is stored (now or by an earlier attempt): show it. */
  | { status: "completed" }
  /** Another tab or request started a review less than 5 minutes ago. */
  | { status: "in_progress" }
  /** Still active (go back to the chat) or abandoned (nothing to review). */
  | { status: "active" | "abandoned" }
  | { status: "missing" }
  | { status: "failed"; message: string; canRetry: boolean };

// Review-specific wording where the shared AI messages talk about Studio explanations.
const REVIEW_MESSAGES: Partial<Record<AIErrorCode, string>> = {
  invalid_input: "There's nothing you wrote in this conversation to review.",
  invalid_output: "The review didn't come out right. Please try again.",
};

/** What to tell the learner about a failed review, from the stored review_error code. */
export function reviewFailure(code: string | null): { message: string; canRetry: boolean } {
  if (code && (AI_ERROR_CODES as readonly string[]).includes(code)) {
    const aiCode = code as AIErrorCode;
    return {
      message: REVIEW_MESSAGES[aiCode] ?? AI_ERROR_MESSAGES[aiCode],
      // Retrying can't help when there's nothing to review.
      canRetry: aiCode !== "invalid_input",
    };
  }
  return { message: "We couldn't save your review. Please try again.", canRetry: true };
}
