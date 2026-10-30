import { z } from "zod";
import {
  GapCategorySchema,
  GapSubCategorySchema,
  isValidGapPair,
  type GapCategory,
  type GapSubCategory,
} from "@/lib/domain/taxonomy";

export const OVERALL_LABELS = ["needs_work", "developing", "good_communication", "strong"] as const;
export type OverallLabel = (typeof OVERALL_LABELS)[number];

/** At most this many corrections per conversation (also enforced by apply_conversation_review). */
export const MAX_CORRECTIONS = 8;

const text = (max: number) => z.string().trim().min(1).max(max);
const Score = z.number().int().min(0).max(100);

/**
 * What the reviewer model returns. Learner messages and target items are referred to by the short
 * refs from the prompt ("m1", "t1"), never by database ids, which models copy unreliably; the
 * service maps refs back to ids and drops anything that doesn't resolve (services/reviewer.ts).
 */
export const ReviewCorrectionOutputSchema = z
  .object({
    messageRef: z.string().trim().max(10),
    original: text(1000),
    improved: text(1000),
    category: GapCategorySchema,
    subCategory: GapSubCategorySchema.nullable(),
    isGrammatical: z.boolean(),
    explanation: text(800),
    saveableExpressions: z.array(z.object({ expression: text(200), meaning: text(300) })).max(3),
  })
  .superRefine((value, ctx) => {
    if (value.subCategory !== null && !isValidGapPair(value.category, value.subCategory)) {
      ctx.addIssue({
        code: "custom",
        path: ["subCategory"],
        message: `"${value.subCategory}" is not a sub-category of "${value.category}".`,
      });
    }
  });

export const ReviewOutputSchema = z.object({
  summary: text(600),
  overallLabel: z.enum(OVERALL_LABELS),
  scores: z.object({
    fluency: Score,
    naturalness: Score,
    grammar: Score,
    vocabulary: Score,
    confidence: Score,
  }),
  strengths: z.array(text(200)).max(4),
  corrections: z.array(ReviewCorrectionOutputSchema).max(MAX_CORRECTIONS),
  targetsUsed: z
    .array(z.object({ targetRef: z.string().trim().max(10), usedNaturally: z.boolean() }))
    .max(10),
});

export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

/**
 * The resolved review: refs replaced by real message / item ids. This is the `p_review` payload of
 * apply_conversation_review (docs/DATABASE.md), so its keys must match what the RPC reads.
 */
export type ConversationReview = {
  model: string;
  summary: string;
  overallLabel: OverallLabel;
  scores: ReviewOutput["scores"];
  strengths: string[];
  corrections: {
    messageId: string;
    original: string;
    improved: string;
    category: GapCategory;
    subCategory: GapSubCategory | null;
    isGrammatical: boolean;
    explanation: string;
    saveableExpressions: { expression: string; meaning: string }[];
  }[];
  targetItemsUsed: { itemId: string; usedNaturally: boolean }[];
};
