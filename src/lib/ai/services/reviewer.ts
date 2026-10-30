import "server-only";

import { AIError } from "../errors";
import { buildReviewerRequest, REVIEWER_PROMPT_VERSION, type ReviewInput } from "../prompts/reviewer";
import { getProvider, type LLMProvider } from "../provider";
import {
  MAX_CORRECTIONS,
  ReviewOutputSchema,
  type ConversationReview,
  type ReviewOutput,
} from "../schemas/review";
import { generateObject } from "../structured";

export type { ReviewInput } from "../prompts/reviewer";

export type ReviewResult = {
  review: ConversationReview;
  /** True when the review came from the mock provider; the UI must say it's a sample. */
  sample: boolean;
  /** Corrections or target reports that didn't resolve and were dropped (logged as a count only). */
  dropped: number;
};

// Thinking tokens count toward the output limit (Gemini); a full review is ~1.5–3k output tokens.
const REVIEW_MAX_TOKENS = 8192;
// Both attempts (first try + repair retry) share this budget; free-tier analysis calls can be slow.
const REVIEW_TIMEOUT_MS = 90_000;

/** Lowercase letters and digits only, so quotes, apostrophes and spacing don't matter. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Maps refs back to ids and keeps only what can be trusted: corrections on a real learner turn
 * whose `original` really appears in that turn (the learner must never see words they didn't
 * write) and whose improvement actually changes something; target reports for real targets,
 * once each.
 */
export function resolveReview(
  output: ReviewOutput,
  refs: Pick<ReturnType<typeof buildReviewerRequest>, "messageRefs" | "targetRefs">,
  model: string,
): { review: ConversationReview; dropped: number } {
  let dropped = 0;
  const order = [...refs.messageRefs.keys()];

  const corrections = output.corrections.flatMap((c) => {
    const message = refs.messageRefs.get(c.messageRef);
    const original = normalize(c.original);
    if (
      !message ||
      !original ||
      !normalize(message.content).includes(original) ||
      normalize(c.improved) === original
    ) {
      dropped += 1;
      return [];
    }
    return [{ ref: c.messageRef, correction: { ...c, messageId: message.id } }];
  });
  // Transcript order; the sort is stable, so corrections on the same turn keep the model's order.
  corrections.sort((a, b) => order.indexOf(a.ref) - order.indexOf(b.ref));

  const seenItems = new Set<string>();
  const targetItemsUsed = output.targetsUsed.flatMap((t) => {
    const target = refs.targetRefs.get(t.targetRef);
    if (!target || seenItems.has(target.itemId)) {
      dropped += 1;
      return [];
    }
    seenItems.add(target.itemId);
    return [{ itemId: target.itemId, usedNaturally: t.usedNaturally }];
  });

  return {
    review: {
      model,
      summary: output.summary,
      overallLabel: output.overallLabel,
      scores: output.scores,
      strengths: output.strengths,
      corrections: corrections.slice(0, MAX_CORRECTIONS).map(({ correction }) => ({
        messageId: correction.messageId,
        original: correction.original,
        improved: correction.improved,
        category: correction.category,
        subCategory: correction.subCategory,
        isGrammatical: correction.isGrammatical,
        explanation: correction.explanation,
        saveableExpressions: correction.saveableExpressions,
      })),
      targetItemsUsed,
    },
    dropped,
  };
}

/**
 * Reviews a finished conversation in one structured call. The caller loads the conversation and
 * supplies the quota check, which runs only once a provider is available.
 */
export async function reviewConversation(
  input: ReviewInput,
  deps: { consumeQuota: () => Promise<void>; provider?: LLMProvider },
): Promise<ReviewResult> {
  if (!input.messages.some((m) => m.role === "user")) {
    throw new AIError("invalid_input", "There is nothing from the learner to review.");
  }
  const provider = deps.provider ?? getProvider();
  await deps.consumeQuota();

  const { system, messages, messageRefs, targetRefs } = buildReviewerRequest(input);
  const output = await generateObject(provider, {
    task: "analysis",
    name: "conversation_review",
    schema: ReviewOutputSchema,
    system,
    messages,
    maxTokens: REVIEW_MAX_TOKENS,
    timeoutMs: REVIEW_TIMEOUT_MS,
  });

  const { review, dropped } = resolveReview(
    output,
    { messageRefs, targetRefs },
    `${provider.name}/${REVIEWER_PROMPT_VERSION}`,
  );
  if (dropped > 0) console.warn("[ai] reviewer output had unresolvable items", { dropped });
  return { review, sample: provider.name === "mock", dropped };
}
