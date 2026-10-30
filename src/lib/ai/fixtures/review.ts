import { readReviewerRequest } from "../prompts/reviewer";
import type { ReviewOutput } from "../schemas/review";

/**
 * Deterministic review for the mock provider (keyless dev, tests, E2E). Says it is a sample.
 * The first learner turn gets one sample correction, so later turns show the "no suggestions"
 * state; a target counts as used naturally when the learner typed it.
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
    targetsUsed: targets
      .filter((target) => typed.includes(target.expression.toLowerCase()))
      .map((target) => ({ targetRef: target.ref, usedNaturally: true })),
  };
}
