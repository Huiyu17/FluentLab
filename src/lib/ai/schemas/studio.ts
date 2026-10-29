import { z } from "zod";

export const STUDIO_CARD_TYPES = ["word", "phrase", "expression"] as const;
/** Same register scale as curated_expressions.register. */
export const REGISTERS = ["casual", "casual_neutral", "neutral", "formal"] as const;
export type Register = (typeof REGISTERS)[number];

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * Expression Studio card (docs/PRODUCT.md → Explanation style). Every field is required;
 * optional content is `null`, which models fill more reliably than omitted keys.
 */
export const StudioCardSchema = z.object({
  expression: text(100),
  type: z.enum(STUDIO_CARD_TYPES),
  ipa: z.string().trim().max(80).nullable(),
  coreMeaning: text(300),
  nativeMeaning: z.string().trim().max(300).nullable(),
  nativeIntuition: text(600),
  patterns: z.array(text(120)).max(5),
  examples: z.array(text(240)).min(2).max(5),
  commonMistake: z.object({ wrong: text(200), right: z.array(text(200)).min(1).max(3) }).nullable(),
  similar: z.array(z.object({ expression: text(100), nuance: text(240) })).max(4),
  register: z.enum(REGISTERS),
  frequency: z.number().int().min(1).max(5),
  tryIt: text(300),
});

export type StudioCard = z.infer<typeof StudioCardSchema>;
