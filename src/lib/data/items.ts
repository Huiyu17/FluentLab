import "server-only";

import { z } from "zod";
import { REGISTERS, StudioCardSchema, type Register, type StudioCard } from "@/lib/ai/schemas/studio";
import { CuratedDetailsSchema, ITEM_TYPES, type CuratedDetails, type ItemType } from "@/lib/items";
import { createClient } from "@/lib/supabase/server";

export type SavedItem = {
  id: string;
  type: ItemType;
  expression: string;
  meaning: string;
  masteryScore: number;
  reviewCount: number;
  nextReviewAt: string;
  createdAt: string;
};

export type ItemDetail = SavedItem & {
  nativeMeaning: string | null;
  example: string | null;
  source: string;
  intervalDays: number;
  ease: number;
  lastReviewedAt: string | null;
  /** The Studio card the item was saved from, if any. */
  card: StudioCard | null;
  /** Context for items added from the curated list. */
  curated: CuratedDetails | null;
};

export type CuratedExpression = {
  id: string;
  expression: string;
  meaning: string;
  usedWhen: string;
  example: string;
  register: Register;
  frequency: number;
  /** The learner's saved copy, if they added it. */
  savedItemId: string | null;
};

const LIST_COLUMNS = "id, type, expression, meaning, mastery_score, review_count, next_review_at, created_at";
const ItemTypeSchema = z.enum(ITEM_TYPES);

function fail(label: string, error: { code?: string }): never {
  console.error(`[items] ${label} failed`, { code: error.code });
  throw new Error(`Could not load ${label}.`);
}

type ListRow = {
  id: string;
  type: string;
  expression: string;
  meaning: string;
  mastery_score: number;
  review_count: number;
  next_review_at: string;
  created_at: string;
};

function toSavedItem(row: ListRow): SavedItem | null {
  const type = ItemTypeSchema.safeParse(row.type);
  if (!type.success) return null;
  return {
    id: row.id,
    type: type.data,
    expression: row.expression,
    meaning: row.meaning,
    masteryScore: row.mastery_score,
    reviewCount: row.review_count,
    nextReviewAt: row.next_review_at,
    createdAt: row.created_at,
  };
}

/** The learner's saved items, newest first. Null when Supabase is not configured. */
export async function listSavedItems(
  userId: string,
  types: readonly ItemType[] = ITEM_TYPES,
): Promise<SavedItem[] | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("learning_items")
    .select(LIST_COLUMNS)
    .eq("user_id", userId)
    .in("type", [...types])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) fail("saved items", error);
  return (data ?? []).flatMap((row) => toSavedItem(row) ?? []);
}

/** One saved item, or null if it doesn't exist (or isn't the learner's, which RLS hides). */
export async function getSavedItem(userId: string, itemId: string): Promise<ItemDetail | null> {
  if (!z.uuid().safeParse(itemId).success) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("learning_items")
    .select(
      `${LIST_COLUMNS}, native_meaning, example, source, interval_days, ease, last_reviewed_at, details`,
    )
    .eq("user_id", userId)
    .eq("id", itemId)
    .maybeSingle();
  if (error) fail("saved item", error);
  if (!data) return null;
  const item = toSavedItem(data);
  if (!item) return null;

  const card = data.source === "studio" ? StudioCardSchema.safeParse(data.details) : null;
  const curated = data.source === "curated" ? CuratedDetailsSchema.safeParse(data.details) : null;
  return {
    ...item,
    nativeMeaning: data.native_meaning,
    example: data.example,
    source: data.source,
    intervalDays: data.interval_days,
    ease: data.ease,
    lastReviewedAt: data.last_reviewed_at,
    card: card?.success ? card.data : null,
    curated: curated?.success ? curated.data : null,
  };
}

/** The shared curated list, marked with the learner's saved copies. */
export async function listCuratedExpressions(userId: string): Promise<CuratedExpression[] | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const [curated, saved] = await Promise.all([
    supabase
      .from("curated_expressions")
      .select("id, expression, meaning, used_when, example, register, frequency")
      .order("frequency", { ascending: false })
      .order("expression"),
    supabase
      .from("learning_items")
      .select("id, source_curated_id")
      .eq("user_id", userId)
      .not("source_curated_id", "is", null),
  ]);
  if (curated.error) fail("curated expressions", curated.error);
  if (saved.error) fail("saved curated expressions", saved.error);

  const savedBy = new Map((saved.data ?? []).map((row) => [row.source_curated_id, row.id]));
  const RegisterSchema = z.enum(REGISTERS);
  return (curated.data ?? []).flatMap((row) => {
    const register = RegisterSchema.safeParse(row.register);
    if (!register.success) return [];
    return [
      {
        id: row.id,
        expression: row.expression,
        meaning: row.meaning,
        usedWhen: row.used_when,
        example: row.example,
        register: register.data,
        frequency: row.frequency,
        savedItemId: savedBy.get(row.id) ?? null,
      },
    ];
  });
}

export type ReviewItem = {
  id: string;
  type: ItemType;
  expression: string;
  meaning: string;
  nativeMeaning: string | null;
  example: string | null;
  /** From the Studio card, when the item has one. */
  tryIt: string | null;
  ease: number;
  intervalDays: number;
  masteryScore: number;
  reviewCount: number;
};

export const REVIEW_SESSION_SIZE = 20;

/**
 * Items due now, earliest first, capped at one session's worth, plus the total due and the
 * next due time (for the "nothing to review" state). Null when Supabase is not configured.
 */
export async function listDueItems(
  userId: string,
  now: Date,
): Promise<{ items: ReviewItem[]; dueCount: number; nextDueAt: string | null } | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const nowIso = now.toISOString();
  const [due, next] = await Promise.all([
    supabase
      .from("learning_items")
      .select(
        "id, type, expression, meaning, native_meaning, example, details, source, ease, interval_days, mastery_score, review_count",
        { count: "exact" },
      )
      .eq("user_id", userId)
      .lte("next_review_at", nowIso)
      .order("next_review_at", { ascending: true })
      .limit(REVIEW_SESSION_SIZE),
    supabase
      .from("learning_items")
      .select("next_review_at")
      .eq("user_id", userId)
      .gt("next_review_at", nowIso)
      .order("next_review_at", { ascending: true })
      .limit(1),
  ]);
  if (due.error) fail("due items", due.error);
  if (next.error) fail("next review", next.error);

  const items = (due.data ?? []).flatMap((row): ReviewItem[] => {
    const type = ItemTypeSchema.safeParse(row.type);
    if (!type.success) return [];
    const card = row.source === "studio" ? StudioCardSchema.safeParse(row.details) : null;
    return [
      {
        id: row.id,
        type: type.data,
        expression: row.expression,
        meaning: row.meaning,
        nativeMeaning: row.native_meaning,
        example: row.example,
        tryIt: card?.success ? card.data.tryIt : null,
        ease: row.ease,
        intervalDays: row.interval_days,
        masteryScore: row.mastery_score,
        reviewCount: row.review_count,
      },
    ];
  });
  return { items, dueCount: due.count ?? items.length, nextDueAt: next.data?.[0]?.next_review_at ?? null };
}
