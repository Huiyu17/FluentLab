import { z } from "zod";

/**
 * Single source of truth for language-gap categories.
 * Mirrored by the `gap_categories` / `gap_taxonomy` tables in
 * supabase/migrations/*_initial_schema.sql. A unit test asserts they match.
 *
 * Corrections, language events and gaps all use these category values.
 * "Naturalness" is a score dimension, not a category (see SCORE_DIMENSION_BY_CATEGORY).
 */
export const GAP_TAXONOMY = {
  pragmatics: [
    "polite_requests",
    "conversation_closing",
    "conversation_opening",
    "disagreeing_politely",
    "small_talk",
    "turn_taking",
  ],
  natural_expression: ["phrasal_verbs", "collocations", "idioms", "filler_and_softeners", "word_choice"],
  register: ["too_formal", "too_casual"],
  grammar: ["articles", "tenses", "prepositions", "word_order", "agreement"],
  vocabulary: ["academic", "everyday", "range_repetition"],
} as const;

export type GapCategory = keyof typeof GAP_TAXONOMY;
export type GapSubCategory = (typeof GAP_TAXONOMY)[GapCategory][number];

export const GAP_CATEGORIES = Object.keys(GAP_TAXONOMY) as GapCategory[];
export const GAP_SUB_CATEGORIES = Object.values(GAP_TAXONOMY).flat() as GapSubCategory[];

/** Score dimensions shown in Conversation Review / Fluency Profile. */
export const SCORE_DIMENSIONS = ["fluency", "naturalness", "grammar", "vocabulary", "confidence"] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

/** Which score dimension a correction/gap category rolls up into. */
export const SCORE_DIMENSION_BY_CATEGORY = {
  pragmatics: "naturalness",
  natural_expression: "naturalness",
  register: "naturalness",
  grammar: "grammar",
  vocabulary: "vocabulary",
} as const satisfies Record<GapCategory, ScoreDimension>;

export const CATEGORY_LABELS: Record<GapCategory, string> = {
  pragmatics: "Pragmatics",
  natural_expression: "Natural expression",
  register: "Register",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
};

export function isValidGapPair(category: string, subCategory: string): boolean {
  if (!Object.hasOwn(GAP_TAXONOMY, category)) return false;
  return (GAP_TAXONOMY[category as GapCategory] as readonly string[]).includes(subCategory);
}

export const GapCategorySchema = z.enum(GAP_CATEGORIES as [GapCategory, ...GapCategory[]]);
export const GapSubCategorySchema = z.enum(GAP_SUB_CATEGORIES as [GapSubCategory, ...GapSubCategory[]]);

/** Required category + sub-category pair (language events, gaps). */
export const GapPairSchema = z
  .object({ category: GapCategorySchema, subCategory: GapSubCategorySchema })
  .refine((v) => isValidGapPair(v.category, v.subCategory), {
    message: "subCategory does not belong to category",
    path: ["subCategory"],
  });

/** Category with optional sub-category (corrections). */
export const OptionalGapPairSchema = z
  .object({ category: GapCategorySchema, subCategory: GapSubCategorySchema.nullable() })
  .refine((v) => v.subCategory === null || isValidGapPair(v.category, v.subCategory), {
    message: "subCategory does not belong to category",
    path: ["subCategory"],
  });
