import { readReviewerRequest } from "../prompts/reviewer";
import type { ReviewOutput } from "../schemas/review";

/**
 * Deterministic review for the mock provider (keyless dev, tests, E2E). Says it is a sample.
 * The first learner turn gets one sample correction, so later turns show the "no suggestions"
 * state; a target counts as used naturally when the learner typed it. Events: the first turn is
 * evidence for "Word choice" (0.9, enough to activate the gap on its own) and the second, if any,
 * a good usage of "Polite requests".
 */
export function mockReview(request: string): ReviewOutput {
  const { learner, targets } = readReviewerRequest(request);
  const first = learner[0];
  const typed = learner.map((turn) => turn.content.toLowerCase()).join("\n");

  return {
    summary:
      "This is a sample review from the mock AI provider. Connect an AI provider to get real feedback on your conversation.",
    overallLabel: "developing",
    scores: { fluency: 70, naturalness: 62, grammar: 75, vocabulary: 68, confidence: 72 },
    strengths: ["You kept the conversation going (sample)."],
    corrections: first
      ? [
          {
            messageRef: first.ref,
            original: first.content,
            improved: "A more natural version of your sentence would appear here.",
            category: "natural_expression",
            subCategory: "word_choice",
            isGrammatical: true,
            explanation:
              "Sample explanation: a real review explains why the new version sounds more natural here.",
            saveableExpressions: [
              { expression: "Would you mind…?", meaning: "A polite way to ask for something." },
            ],
          },
        ]
      : [],
    events: [
      ...(first
        ? [
            {
              messageRef: first.ref,
              eventType: "unnatural_expression" as const,
              category: "natural_expression" as const,
              subCategory: "word_choice" as const,
              original: first.content,
              suggestion: "A more natural version of your sentence would appear here.",
              context: "Sample event",
              confidence: 0.9,
            },
          ]
        : []),
      ...(learner[1]
        ? [
            {
              messageRef: learner[1].ref,
              eventType: "good_usage" as const,
              category: "pragmatics" as const,
              subCategory: "polite_requests" as const,
              original: learner[1].content,
              suggestion: null,
              context: "Sample event",
              confidence: 0.8,
            },
          ]
        : []),
    ],
    targetsUsed: targets
      .filter((target) => typed.includes(target.expression.toLowerCase()))
      .map((target) => ({ targetRef: target.ref, usedNaturally: true })),
  };
}
