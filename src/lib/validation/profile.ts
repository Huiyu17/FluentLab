import { z } from "zod";

export const ENGLISH_LEVELS = ["intermediate", "upper_intermediate", "advanced"] as const;
export const LEARNING_CONTEXTS = ["campus", "social", "everyday", "career", "travel"] as const;
export const DAILY_GOAL_OPTIONS = [10, 15, 20, 30, 45] as const;

export type EnglishLevel = (typeof ENGLISH_LEVELS)[number];
export type LearningContext = (typeof LEARNING_CONTEXTS)[number];

export const ENGLISH_LEVEL_LABELS: Record<EnglishLevel, { label: string; hint: string }> = {
  intermediate: {
    label: "Intermediate",
    hint: "I can get by, but I often pause to find words.",
  },
  upper_intermediate: {
    label: "Upper intermediate",
    hint: "I'm comfortable in most situations, but I don't always sound natural.",
  },
  advanced: {
    label: "Advanced",
    hint: "I'm fluent, and I want to polish nuance and register.",
  },
};

export const LEARNING_CONTEXT_LABELS: Record<LearningContext, { label: string; hint: string }> = {
  campus: { label: "Campus", hint: "Office hours, class discussion, group projects" },
  social: { label: "Social", hint: "Small talk, parties, making friends" },
  everyday: { label: "Everyday life", hint: "Shops, roommates, appointments" },
  career: { label: "Career", hint: "Career fairs, interviews, networking" },
  travel: { label: "Travel", hint: "Airports, hotels, getting around" },
};

/** Suggestions only; native_language is free text (≤ 60 chars, matches the DB check). */
export const COMMON_NATIVE_LANGUAGES = [
  "Chinese (Mandarin)",
  "Chinese (Cantonese)",
  "Spanish",
  "Hindi",
  "Arabic",
  "Portuguese",
  "Korean",
  "Japanese",
  "Vietnamese",
  "French",
  "German",
  "Russian",
  "Turkish",
  "Indonesian",
];

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Unknown or missing time zones fall back to UTC instead of failing the form. */
export const TimeZoneSchema = z.string().trim().max(64).refine(isValidTimeZone).catch("UTC");

const trimmedOptional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { error: message })
    .transform((v) => (v === "" ? null : v));

/** Fields editable from onboarding and settings. Mirrors the profiles table checks. */
export const ProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: "Tell us what to call you." })
    .max(80, { error: "Use 80 characters or fewer." }),
  nativeLanguage: z
    .string()
    .trim()
    .min(1, { error: "Choose or type your native language." })
    .max(60, { error: "Use 60 characters or fewer." }),
  englishLevel: z.enum(ENGLISH_LEVELS, { error: "Choose the level that fits best." }),
  learningGoal: trimmedOptional(500, "Use 500 characters or fewer."),
  contexts: z
    .array(z.enum(LEARNING_CONTEXTS))
    .min(1, { error: "Pick at least one place you use English." })
    .max(LEARNING_CONTEXTS.length)
    .transform((v) => [...new Set(v)]),
  dailyGoalMinutes: z.coerce
    .number({ error: "Choose a daily goal." })
    .int()
    .min(5, { error: "Choose between 5 and 120 minutes." })
    .max(120, { error: "Choose between 5 and 120 minutes." }),
  timezone: TimeZoneSchema,
});

export type ProfileInput = z.infer<typeof ProfileSchema>;

/** Parse a <form> submission into ProfileSchema input (checkbox groups → arrays). */
export function profileFormValues(formData: FormData) {
  return {
    displayName: formData.get("displayName") ?? "",
    nativeLanguage: formData.get("nativeLanguage") ?? "",
    englishLevel: formData.get("englishLevel") ?? undefined,
    learningGoal: formData.get("learningGoal") ?? "",
    contexts: formData.getAll("contexts"),
    dailyGoalMinutes: formData.get("dailyGoalMinutes") ?? undefined,
    timezone: formData.get("timezone") ?? "UTC",
  };
}

/** Map validated input to profiles table columns. */
export function toProfileRow(input: ProfileInput) {
  return {
    display_name: input.displayName,
    native_language: input.nativeLanguage,
    english_level: input.englishLevel,
    learning_goal: input.learningGoal,
    contexts: input.contexts,
    daily_goal_minutes: input.dailyGoalMinutes,
    timezone: input.timezone,
  };
}
