import { z } from "zod";

/** Mirrors the char_length checks on public.debriefs. */
export const DEBRIEF_LIMITS = { situation: 2000, whatYouSaid: 2000 } as const;

/**
 * A real-life situation the learner wants to debrief. Free text that only ever reaches the coach
 * as tagged data (docs/ARCHITECTURE.md → Security); length limits are the main guard.
 */
export const DebriefInputSchema = z.object({
  situation: z
    .string()
    .trim()
    .min(1, { error: "Describe what happened." })
    .max(DEBRIEF_LIMITS.situation, { error: `Keep it under ${DEBRIEF_LIMITS.situation} characters.` }),
  // Blank → null: the coach works from the situation alone.
  whatYouSaid: z
    .string()
    .trim()
    .max(DEBRIEF_LIMITS.whatYouSaid, { error: `Keep it under ${DEBRIEF_LIMITS.whatYouSaid} characters.` })
    .transform((v) => v || null),
});

export type DebriefInput = z.infer<typeof DebriefInputSchema>;
