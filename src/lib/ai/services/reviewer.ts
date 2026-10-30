import "server-only";

import { AIError } from "../errors";
import { buildReviewerRequest, REVIEWER_PROMPT_VERSION, type ReviewInput } from "../prompts/reviewer";
import { getProvider, type LLMProvider } from "../provider";
import {
  MAX_CORRECTIONS,
  ReviewOutputSchema,
  type ConversationReview,
  type LanguageEventDraft,
  type ReviewOutput,
} from "../schemas/review";
import { generateObject } from "../structured";

export type { ReviewInput } from "../prompts/reviewer";

export type ReviewResult = {
  review: ConversationReview;
  /** Gap evidence for apply_conversation_review's `p_events`. */
  events: LanguageEventDraft[];
  /** True when the review came from the mock provider; the UI must say it's a sample. */
  sample: boolean;
  /** Corrections, events or target reports that didn't resolve and were dropped (logged as a count only). */
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

/** True when `quote` really appears in the learner's turn (the learner never sees words they didn't write). */
function quotes(content: string, quote: string): boolean {
  const normalized = normalize(quote);
  return normalized.length > 0 && normalize(content).includes(normalized);
}

/**
 * Maps refs back to ids and keeps only what can be trusted: corrections and events on a real
 * learner turn whose `original` really appears in that turn; corrections whose improvement
 * actually changes something; events once per (message, type, sub-category), keeping the most
 * confident; target reports for real targets, once each.
 */
export function resolveReview(
  output: ReviewOutput,
  refs: Pick<ReturnType<typeof buildReviewerRequest>, "messageRefs" | "targetRefs">,
  model: string,
): { review: ConversationReview; events: LanguageEventDraft[]; dropped: number } {
  let dropped = 0;
  const order = [...refs.messageRefs.keys()];

  const corrections = output.corrections.flatMap((c) => {
    const message = refs.messageRefs.get(c.messageRef);
    if (!message || !quotes(message.content, c.original) || normalize(c.improved) === normalize(c.original)) {
      dropped += 1;
      return [];
    }
    return [{ ref: c.messageRef, correction: { ...c, messageId: message.id } }];
  });
  // Transcript order; the sort is stable, so corrections on the same turn keep the model's order.
  corrections.sort((a, b) => order.indexOf(a.ref) - order.indexOf(b.ref));

  // Same key as language_events' natural key, which would silently keep only the first.
  const events = new Map<string, LanguageEventDraft>();
  for (const e of output.events) {
    const message = refs.messageRefs.get(e.messageRef);
    if (!message || !quotes(message.content, e.original)) {
      dropped += 1;
      continue;
    }
    const draft: LanguageEventDraft = {
      messageId: message.id,
      eventType: e.eventType,
      category: e.category,
      subCategory: e.subCategory,
      original: e.original,
      suggestion: e.eventType === "good_usage" ? null : e.suggestion,
      context: e.context,
      confidence: Math.round(e.confidence * 100) / 100,
    };
    const key = `${draft.messageId}|${draft.eventType}|${draft.category}|${draft.subCategory}`;
    const existing = events.get(key);
    if (existing) dropped += 1;
    if (!existing || draft.confidence > existing.confidence) events.set(key, draft);
  }

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
    events: [...events.values()],
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

  const { review, events, dropped } = resolveReview(
    output,
    { messageRefs, targetRefs },
    `${provider.name}/${REVIEWER_PROMPT_VERSION}`,
  );
  if (dropped > 0) console.warn("[ai] reviewer output had unresolvable items", { dropped });
  return { review, events, sample: provider.name === "mock", dropped };
}
