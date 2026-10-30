import "server-only";

import { z } from "zod";
import { OVERALL_LABELS, type OverallLabel } from "@/lib/ai/schemas/review";
import {
  GapCategorySchema,
  GapSubCategorySchema,
  type GapCategory,
  type GapSubCategory,
} from "@/lib/domain/taxonomy";
import { EVIDENCE_MIN_CONFIDENCE, GAP_STATUSES, type GapStatus } from "@/lib/domain/gaps";
import { createClient } from "@/lib/supabase/server";

export type SaveableExpression = { expression: string; meaning: string };

export type ReviewCorrection = {
  id: string;
  messageId: string;
  position: number;
  original: string;
  improved: string;
  category: GapCategory;
  subCategory: GapSubCategory | null;
  isGrammatical: boolean;
  explanation: string;
  saveableExpressions: SaveableExpression[];
};

export type ConversationReviewView = {
  summary: string;
  overallLabel: OverallLabel;
  scores: { fluency: number; naturalness: number; grammar: number; vocabulary: number; confidence: number };
  strengths: string[];
  /** e.g. "mock/reviewer-v2": the UI labels mock reviews as samples. */
  model: string | null;
  corrections: ReviewCorrection[];
};

const SaveableSchema = z.array(z.object({ expression: z.string(), meaning: z.string() })).catch([]);

function fail(label: string, error: { code?: string }): never {
  console.error(`[reviews] ${label} failed`, { code: error.code });
  throw new Error(`Could not load ${label}.`);
}

/** The stored review of one of the learner's conversations, or null if there isn't one (yet). */
export async function getConversationReview(
  userId: string,
  conversationId: string,
): Promise<ConversationReviewView | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const [feedback, corrections] = await Promise.all([
    supabase
      .from("conversation_feedback")
      .select(
        "summary, overall_label, fluency_score, naturalness_score, grammar_score, vocabulary_score, confidence_score, strengths, model",
      )
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .maybeSingle(),
    supabase
      .from("corrections")
      .select(
        "id, message_id, position, original, improved, category, sub_category, is_grammatical, explanation, saveable_expressions",
      )
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .order("position", { ascending: true }),
  ]);
  if (feedback.error) fail("review", feedback.error);
  if (corrections.error) fail("corrections", corrections.error);
  if (!feedback.data) return null;

  const f = feedback.data;
  return {
    summary: f.summary,
    overallLabel: z.enum(OVERALL_LABELS).catch("developing").parse(f.overall_label),
    scores: {
      fluency: f.fluency_score,
      naturalness: f.naturalness_score,
      grammar: f.grammar_score,
      vocabulary: f.vocabulary_score,
      confidence: f.confidence_score,
    },
    strengths: f.strengths,
    model: f.model,
    corrections: (corrections.data ?? []).flatMap((c) => {
      const category = GapCategorySchema.safeParse(c.category);
      if (!category.success) return [];
      return [
        {
          id: c.id,
          messageId: c.message_id,
          position: c.position,
          original: c.original,
          improved: c.improved,
          category: category.data,
          subCategory: GapSubCategorySchema.nullable().catch(null).parse(c.sub_category),
          isGrammatical: c.is_grammatical,
          explanation: c.explanation,
          saveableExpressions: SaveableSchema.parse(c.saveable_expressions),
        },
      ];
    }),
  };
}

/** Same key as the learning_items unique index: lower(btrim(expression)). */
export function expressionKey(expression: string): string {
  return expression.trim().toLowerCase();
}

/**
 * Which of these expressions the learner already has in My English (from any source), keyed by
 * expressionKey(). Read from the server on every render, so a copy deleted elsewhere shows as
 * unsaved again (docs/TASKS.md M4 note).
 */
export async function findSavedExpressions(
  userId: string,
  expressions: readonly string[],
): Promise<Map<string, string>> {
  const saved = new Map<string, string>();
  if (expressions.length === 0) return saved;
  const supabase = await createClient();
  if (!supabase) return saved;

  const wanted = new Set(expressions.map(expressionKey));
  const { data, error } = await supabase
    .from("learning_items")
    .select("id, expression")
    .eq("user_id", userId)
    .limit(5000);
  if (error) fail("saved expressions", error);
  for (const row of data ?? []) {
    const key = expressionKey(row.expression);
    if (wanted.has(key)) saved.set(key, row.id);
  }
  return saved;
}

/** A gap this conversation added evidence to, and what it added. */
export type ConversationPattern = {
  gapId: string;
  title: string;
  status: GapStatus;
  /** Negative evidence (confidence ≥ 0.6) from this conversation. */
  issues: number;
  /** Good usages (confidence ≥ 0.6) from this conversation. */
  goodUses: number;
};

/**
 * The gaps this conversation's language events count towards, with the gap's current status.
 * Low-confidence events are stored but aren't evidence, so they aren't shown either.
 */
export async function getConversationPatterns(
  userId: string,
  conversationId: string,
): Promise<ConversationPattern[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data: events, error } = await supabase
    .from("language_events")
    .select("gap_id, event_type, confidence")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .gte("confidence", EVIDENCE_MIN_CONFIDENCE)
    .not("gap_id", "is", null);
  if (error) fail("conversation events", error);

  const counts = new Map<string, { issues: number; goodUses: number }>();
  for (const e of events ?? []) {
    if (!e.gap_id) continue;
    const count = counts.get(e.gap_id) ?? { issues: 0, goodUses: 0 };
    if (e.event_type === "good_usage") count.goodUses += 1;
    else count.issues += 1;
    counts.set(e.gap_id, count);
  }
  if (counts.size === 0) return [];

  const { data: gaps, error: gapsError } = await supabase
    .from("language_gaps")
    .select("id, title, status")
    .eq("user_id", userId)
    .in("id", [...counts.keys()]);
  if (gapsError) fail("conversation gaps", gapsError);

  const StatusSchema = z.enum(GAP_STATUSES);
  return (gaps ?? [])
    .flatMap((g) => {
      const status = StatusSchema.safeParse(g.status);
      const count = counts.get(g.id);
      return status.success && count ? [{ gapId: g.id, title: g.title, status: status.data, ...count }] : [];
    })
    .sort((a, b) => b.issues - a.issues || b.goodUses - a.goodUses || a.title.localeCompare(b.title));
}
