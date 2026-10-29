import { z } from "zod";

export const STUDIO_KINDS = ["vocabulary", "expression"] as const;
export type StudioKind = (typeof STUDIO_KINDS)[number];

export const STUDIO_INPUT_MAX = 100;

/** What a learner types into Studio: one word or a short phrase on a single line. */
export const StudioInputSchema = z.object({
  expression: z
    .string()
    .trim()
    .min(1, { error: "Type a word or phrase." })
    .max(STUDIO_INPUT_MAX, { error: `Keep it under ${STUDIO_INPUT_MAX} characters.` })
    // Single line, no control characters, and at least one letter.
    .refine((v) => !/[\p{Cc}]/u.test(v), { error: "Use a single line of text." })
    .refine((v) => /\p{L}/u.test(v), { error: "Type a word or phrase." })
    .transform((v) => v.replace(/\s+/g, " ")),
  kind: z.enum(STUDIO_KINDS),
});

export type StudioInput = z.infer<typeof StudioInputSchema>;
