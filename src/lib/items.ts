import { z } from "zod";
import { REGISTERS, type Register } from "@/lib/ai/schemas/studio";

/** learning_items.type */
export const ITEM_TYPES = ["word", "phrase", "expression", "grammar"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  word: "Word",
  phrase: "Phrase",
  expression: "Expression",
  grammar: "Grammar",
};

/** Words live under Vocabulary; everything else under Expressions. */
export function itemHref(type: ItemType, id: string): string {
  return type === "word" ? `/vocabulary/${id}` : `/expressions/${id}`;
}

export const REGISTER_LABELS: Record<Register, string> = {
  casual: "Casual",
  casual_neutral: "Casual to neutral",
  neutral: "Neutral",
  formal: "Formal",
};

export function frequencyLabel(frequency: number): string {
  if (frequency >= 5) return "Very common";
  if (frequency === 4) return "Common";
  if (frequency === 3) return "Fairly common";
  if (frequency === 2) return "Uncommon";
  return "Rare";
}

/** `learning_items.details` for items added from the curated list. */
export const CuratedDetailsSchema = z.object({
  usedWhen: z.string(),
  register: z.enum(REGISTERS),
  frequency: z.number().int().min(1).max(5),
});
export type CuratedDetails = z.infer<typeof CuratedDetailsSchema>;

/** My English filters, read from the URL so they survive reloads and can be shared. */
export const ITEM_FILTER_TYPES = ["all", "word", "expression"] as const;
export const ITEM_FILTER_STATUSES = ["all", "due"] as const;
export type ItemFilters = {
  type: (typeof ITEM_FILTER_TYPES)[number];
  status: (typeof ITEM_FILTER_STATUSES)[number];
};

const ItemFiltersSchema = z.object({
  type: z.enum(ITEM_FILTER_TYPES).catch("all"),
  status: z.enum(ITEM_FILTER_STATUSES).catch("all"),
});

/** Unknown or repeated values fall back to "all". */
export function parseItemFilters(params: Record<string, string | string[] | undefined>): ItemFilters {
  return ItemFiltersSchema.parse({ type: params.type, status: params.status });
}

/** `?type=…&status=…`, leaving out defaults. */
export function itemFiltersQuery(filters: ItemFilters): string {
  const query = new URLSearchParams();
  if (filters.type !== "all") query.set("type", filters.type);
  if (filters.status !== "all") query.set("status", filters.status);
  const text = query.toString();
  return text ? `?${text}` : "";
}

export function isDue(item: { nextReviewAt: string }, now: Date): boolean {
  return new Date(item.nextReviewAt).getTime() <= now.getTime();
}

/** "expression" covers everything that isn't a single word (phrases, expressions, grammar). */
export function filterItems<T extends { type: ItemType; nextReviewAt: string }>(
  items: readonly T[],
  filters: ItemFilters,
  now: Date,
): T[] {
  return items.filter(
    (item) =>
      (filters.type === "all" || (filters.type === "word") === (item.type === "word")) &&
      (filters.status === "all" || isDue(item, now)),
  );
}
