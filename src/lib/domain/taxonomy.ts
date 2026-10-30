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

/**
 * Fixed, learner-facing title and description for each sub-category. Gaps use these (never
 * AI-written text), so a gap reads the same in every conversation that adds evidence to it.
 */
export const GAP_DETAILS: Record<GapSubCategory, { title: string; description: string }> = {
  polite_requests: {
    title: "Polite requests",
    description:
      'Requests can sound too direct, like an order. Softeners such as "Could you…?" or "Would you mind…?" help.',
  },
  conversation_closing: {
    title: "Ending conversations",
    description: "Wrapping up a conversation smoothly, without stopping abruptly or dragging on.",
  },
  conversation_opening: {
    title: "Starting conversations",
    description: "Opening naturally: a greeting and a little context before getting to the point.",
  },
  disagreeing_politely: {
    title: "Disagreeing politely",
    description: "Pushing back or saying no while keeping the tone friendly and respectful.",
  },
  small_talk: {
    title: "Small talk",
    description: "Keeping casual conversation going: follow-up questions, reactions and sharing a little.",
  },
  turn_taking: {
    title: "Turn-taking",
    description:
      "Answering in a way that invites the other person in, instead of very short or very long turns.",
  },
  phrasal_verbs: {
    title: "Phrasal verbs",
    description:
      'Everyday verbs like "figure out" or "follow up" that sound more natural than formal single words.',
  },
  collocations: {
    title: "Word combinations",
    description: 'Words that natives put together, like "make a decision" rather than "do a decision".',
  },
  idioms: {
    title: "Idioms",
    description: "Common idiomatic expressions, used in the right place and in the usual form.",
  },
  filler_and_softeners: {
    title: "Fillers and softeners",
    description:
      'Small words like "actually", "just" or "kind of" that make speech sound relaxed and less blunt.',
  },
  word_choice: {
    title: "Word choice",
    description: "Picking the word a native speaker would use in this situation.",
  },
  too_formal: {
    title: "Too formal",
    description: "Sounding stiff or bookish in a casual situation.",
  },
  too_casual: {
    title: "Too casual",
    description: "Sounding too relaxed for a professor, a manager or someone you've just met.",
  },
  articles: {
    title: "Articles",
    description: 'Using "a", "an", "the" or no article.',
  },
  tenses: {
    title: "Verb tenses",
    description: "Choosing the tense that matches when something happened.",
  },
  prepositions: {
    title: "Prepositions",
    description: 'Small words like "in", "on", "at" and "for" in the usual combinations.',
  },
  word_order: {
    title: "Word order",
    description: "Putting words in the natural order, especially in questions.",
  },
  agreement: {
    title: "Agreement",
    description: 'Matching verbs and nouns: singular and plural, "he goes" rather than "he go".',
  },
  academic: {
    title: "Academic vocabulary",
    description: "Words for classes, research and campus life.",
  },
  everyday: {
    title: "Everyday vocabulary",
    description: "Common words for daily situations.",
  },
  range_repetition: {
    title: "Vocabulary range",
    description: "Reusing the same few words; trying some variety.",
  },
};
