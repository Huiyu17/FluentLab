import { z } from "zod";
import { ENGLISH_LEVELS } from "@/lib/validation/profile";
import { SCENARIO_LIMITS } from "@/lib/validation/scenario";

/** Formality of a suggested phrasing, from relaxed to careful. */
export const PHRASING_REGISTERS = ["casual", "neutral", "formal"] as const;
export type PhrasingRegister = (typeof PHRASING_REGISTERS)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const limited = (field: keyof typeof SCENARIO_LIMITS) => text(SCENARIO_LIMITS[field]);

/**
 * The practice scenario the coach writes for the situation. Same limits as a learner's own custom
 * scenario (validation/scenario.ts), so "Practice this situation" can save it after one more
 * CustomScenarioSchema check.
 */
export const DebriefScenarioSchema = z.object({
  title: limited("title"),
  description: z.string().trim().max(SCENARIO_LIMITS.description),
  userRole: limited("userRole"),
  aiRole: limited("aiRole"),
  aiPersonality: z.string().trim().max(SCENARIO_LIMITS.aiPersonality),
  goal: limited("goal"),
  difficulty: z.enum(ENGLISH_LEVELS),
  openingLine: limited("openingLine").nullable(),
  estMinutes: z.number().int().min(5).max(15),
});

/** Debrief Coach output (docs/AI_SYSTEM.md → Debrief). Stored as debriefs.result. */
export const DebriefResultSchema = z.object({
  /** One line restating the situation, so the learner sees it was understood. */
  situationSummary: text(300),
  phrasings: z
    .array(z.object({ register: z.enum(PHRASING_REGISTERS), text: text(400), note: text(240) }))
    .min(3)
    .max(5),
  explanation: text(1200),
  expressions: z.array(z.object({ expression: text(200), meaning: text(300) })).max(3),
  scenario: DebriefScenarioSchema,
});

export type DebriefResult = z.infer<typeof DebriefResultSchema>;
