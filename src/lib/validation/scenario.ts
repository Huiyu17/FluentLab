import { z } from "zod";
import { ENGLISH_LEVELS, LEARNING_CONTEXTS } from "./profile";

/** scenarios.category: shared scenarios use a learning context; learners' own use "custom". */
export const SCENARIO_CATEGORIES = [...LEARNING_CONTEXTS, "custom"] as const;
export type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

/** Mirrors the char_length checks on public.scenarios (a unit test compares them). */
export const SCENARIO_LIMITS = {
  title: 120,
  description: 1000,
  userRole: 300,
  aiRole: 300,
  aiPersonality: 300,
  goal: 500,
  openingLine: 500,
} as const;

export const EST_MINUTES_OPTIONS = [5, 8, 10, 15] as const;

/** Keeps one account from filling the table; generous for real use. */
export const MAX_CUSTOM_SCENARIOS = 50;

type LimitedField = keyof typeof SCENARIO_LIMITS;

const required = (field: LimitedField, message: string) =>
  z
    .string()
    .trim()
    .min(1, { error: message })
    .max(SCENARIO_LIMITS[field], { error: `Keep it under ${SCENARIO_LIMITS[field]} characters.` });

const optional = (field: LimitedField) =>
  z
    .string()
    .trim()
    .max(SCENARIO_LIMITS[field], { error: `Keep it under ${SCENARIO_LIMITS[field]} characters.` });

/**
 * A learner's own scenario. Free text here only ever reaches the tutor as delimited data,
 * never as instructions (docs/ARCHITECTURE.md → Security), so length limits are the main guard.
 */
export const CustomScenarioSchema = z.object({
  title: required("title", "Give your scenario a short title."),
  description: optional("description"),
  userRole: required("userRole", "Describe who you are in this situation."),
  aiRole: required("aiRole", "Describe who you'll be talking to."),
  aiPersonality: optional("aiPersonality"),
  goal: required("goal", "What do you want to get out of the conversation?"),
  difficulty: z.enum(ENGLISH_LEVELS, { error: "Choose a difficulty." }),
  // Blank → null: the tutor opens the conversation itself.
  openingLine: optional("openingLine").transform((v) => v || null),
  estMinutes: z.coerce
    .number({ error: "Choose a length." })
    .int({ error: "Choose a length." })
    .min(1, { error: "Choose a length." })
    .max(60, { error: "Choose a length." }),
});

export type CustomScenarioInput = z.infer<typeof CustomScenarioSchema>;
export type CustomScenarioField = keyof CustomScenarioInput;

export function customScenarioValues(
  formData: FormData,
): Record<CustomScenarioField, FormDataEntryValue | null> {
  return {
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    userRole: formData.get("userRole"),
    aiRole: formData.get("aiRole"),
    aiPersonality: formData.get("aiPersonality") ?? "",
    goal: formData.get("goal"),
    difficulty: formData.get("difficulty"),
    openingLine: formData.get("openingLine") ?? "",
    estMinutes: formData.get("estMinutes"),
  };
}

/** Columns a learner may write (matches the column grants on scenarios). */
export function toScenarioRow(input: CustomScenarioInput) {
  return {
    title: input.title,
    description: input.description,
    user_role: input.userRole,
    ai_role: input.aiRole,
    ai_personality: input.aiPersonality,
    goal: input.goal,
    difficulty: input.difficulty,
    opening_line: input.openingLine,
    est_minutes: input.estMinutes,
  };
}
