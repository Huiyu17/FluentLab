import { z } from "zod";
import { ENGLISH_LEVELS } from "@/lib/validation/profile";
import { SCENARIO_CATEGORIES } from "@/lib/validation/scenario";

export const CONVERSATION_STATUSES = [
  "active",
  "reviewing",
  "completed",
  "failed_review",
  "abandoned",
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/** How a status reads in lists (Today's recent activity, Conversation History). */
export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  active: "In progress",
  reviewing: "Review in progress",
  completed: "Reviewed",
  failed_review: "Review didn't finish",
  abandoned: "Ended early",
};

/** Where a conversation opens: its review once ended with something to review, else the chat. */
export function conversationHref(id: string, status: ConversationStatus): string {
  return status === "active" || status === "abandoned"
    ? `/conversations/${id}`
    : `/conversations/${id}/review`;
}

/** Longest learner message, in characters (docs/ARCHITECTURE.md → Conversation state). */
export const MAX_MESSAGE_CHARS = 1000;
/** Learner turns per conversation; the tutor wraps up when the cap is reached. */
export const MAX_USER_TURNS = 30;

/**
 * What a conversation remembers about its scenario. Stored in `conversations.scenario_snapshot`
 * when it starts, so later edits or deletion of a custom scenario don't change a conversation
 * that already happened. Free text in here can be learner-written: prompts treat it as data.
 */
export const ScenarioSnapshotSchema = z.object({
  scenarioId: z.string().nullable(),
  slug: z.string().nullable(),
  isCustom: z.boolean(),
  category: z.enum(SCENARIO_CATEGORIES),
  title: z.string(),
  description: z.string(),
  userRole: z.string(),
  aiRole: z.string(),
  aiPersonality: z.string(),
  goal: z.string(),
  difficulty: z.enum(ENGLISH_LEVELS),
  openingLine: z.string().nullable(),
  estMinutes: z.number(),
});

export type ScenarioSnapshot = z.infer<typeof ScenarioSnapshotSchema>;

export function toScenarioSnapshot(scenario: {
  id: string;
  slug: string | null;
  isCustom: boolean;
  category: ScenarioSnapshot["category"];
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  aiPersonality: string;
  goal: string;
  difficulty: ScenarioSnapshot["difficulty"];
  openingLine: string | null;
  estMinutes: number;
}): ScenarioSnapshot {
  return {
    scenarioId: scenario.id,
    slug: scenario.slug,
    isCustom: scenario.isCustom,
    category: scenario.category,
    title: scenario.title,
    description: scenario.description,
    userRole: scenario.userRole,
    aiRole: scenario.aiRole,
    aiPersonality: scenario.aiPersonality,
    goal: scenario.goal,
    difficulty: scenario.difficulty,
    openingLine: scenario.openingLine,
    estMinutes: scenario.estMinutes,
  };
}

/**
 * A short speaker name from a role description, so the chat says "Professor Lee" rather than
 * "Assistant" (docs/DESIGN_SYSTEM.md → Chat): "Professor Lee, who teaches the course" → "Professor Lee".
 */
export function speakerName(aiRole: string): string {
  const name = aiRole
    .split(/,|\(| who | - | – /)[0]!
    .replace(/^(my|your)\s+/i, "")
    .trim();
  const short = name.length > 40 ? `${name.slice(0, 39).trimEnd()}…` : name;
  return short ? short.charAt(0).toUpperCase() + short.slice(1) : "Your partner";
}
