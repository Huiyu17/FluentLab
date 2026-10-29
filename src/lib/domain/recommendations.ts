/**
 * Today plan: deterministic, rule-based recommendations (no LLM).
 *
 * M3 version. Picks one conversation, one review session when items are due and one Studio
 * suggestion, each with a human-readable reason. The ranking formula from docs/AI_SYSTEM.md
 * (severity weight × recency decay × not practiced in 2 days) replaces the simple gap pick
 * once gaps are produced (M8); the output shape stays the same.
 */
import type { DayKey } from "./streak";
import { LEARNING_CONTEXT_LABELS, type LearningContext } from "@/lib/validation/profile";

export type GapSeverity = "low" | "medium" | "high";

export type PlanGap = {
  id: string;
  title: string;
  severity: GapSeverity;
  evidenceCount: number;
  lastDetectedAt: string;
};

export type PlanScenario = {
  slug: string;
  title: string;
  /** Shared scenarios use a learning context; custom ones use "custom". */
  category: LearningContext | "custom";
  estMinutes: number;
};

export type PlanInput = {
  contexts: readonly LearningContext[];
  dueReviewCount: number;
  /** Open gaps (emerging, active or improving). */
  gaps: readonly PlanGap[];
  /** Shared scenario catalog. */
  scenarios: readonly PlanScenario[];
  /** Slugs of the learner's most recent conversations, newest first. */
  recentScenarioSlugs: readonly string[];
  /** Today in the learner's time zone; rotates the suggestion from day to day. */
  today: DayKey;
};

export type Recommendation =
  | {
      kind: "conversation";
      title: string;
      reason: string;
      href: string;
      minutes: number;
      scenarioSlug: string;
      gapId: string | null;
    }
  | { kind: "review"; title: string; reason: string; href: string; minutes: number; dueCount: number }
  | { kind: "studio"; title: string; reason: string; href: string; minutes: number };

const SEVERITY_WEIGHT: Record<GapSeverity, number> = { high: 3, medium: 2, low: 1 };

/** Highest severity first, then most evidence, then most recently seen. */
export function rankGaps<T extends PlanGap>(gaps: readonly T[]): T[] {
  return [...gaps].sort(
    (a, b) =>
      SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] ||
      b.evidenceCount - a.evidenceCount ||
      b.lastDetectedAt.localeCompare(a.lastDetectedAt),
  );
}

export function pickFocusGap(gaps: readonly PlanGap[]): PlanGap | null {
  return rankGaps(gaps)[0] ?? null;
}

/** Stable small hash so the same day always gives the same pick. */
function dayIndex(today: DayKey, length: number): number {
  let hash = 0;
  for (const char of today) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % length;
}

function pickScenario(input: PlanInput): PlanScenario | null {
  const shared = input.scenarios.filter((s) => s.category !== "custom");
  const inContexts = shared.filter((s) => input.contexts.includes(s.category as LearningContext));
  const pool = inContexts.length > 0 ? inContexts : shared;
  if (pool.length === 0) return null;

  // Prefer something not practiced recently; fall back to the whole pool.
  const recent = new Set(input.recentScenarioSlugs.slice(0, 3));
  const fresh = pool.filter((s) => !recent.has(s.slug));
  const candidates = [...(fresh.length > 0 ? fresh : pool)].sort((a, b) => a.slug.localeCompare(b.slug));
  return candidates[dayIndex(input.today, candidates.length)] ?? null;
}

function conversation(input: PlanInput): Recommendation | null {
  const scenario = pickScenario(input);
  if (!scenario) return null;

  const gap = pickFocusGap(input.gaps);
  const contextLabel =
    scenario.category === "custom" ? null : LEARNING_CONTEXT_LABELS[scenario.category].label;
  const reason = gap
    ? `Practice "${gap.title}": seen ${gap.evidenceCount}× in your conversations.`
    : contextLabel && input.contexts.includes(scenario.category as LearningContext)
      ? `Matches where you use English: ${contextLabel}.`
      : "A good everyday conversation to warm up with.";

  return {
    kind: "conversation",
    title: scenario.title,
    reason,
    href: `/simulator/${scenario.slug}`,
    minutes: scenario.estMinutes,
    scenarioSlug: scenario.slug,
    gapId: gap?.id ?? null,
  };
}

function review(dueCount: number): Recommendation | null {
  if (dueCount <= 0) return null;
  return {
    kind: "review",
    title: "Review saved expressions",
    reason:
      dueCount === 1
        ? "1 saved expression is due for review."
        : `${dueCount} saved expressions are due for review.`,
    href: "/my-english/review",
    // About 30 seconds per item, between 3 and 10 minutes.
    minutes: Math.min(10, Math.max(3, Math.ceil(dueCount / 2))),
    dueCount,
  };
}

function studio(input: PlanInput): Recommendation {
  const context = input.contexts[dayIndex(input.today, Math.max(input.contexts.length, 1))];
  return {
    kind: "studio",
    title: "Learn one natural expression",
    reason: context
      ? `Add a phrase you can use in ${LEARNING_CONTEXT_LABELS[context].label.toLowerCase()} situations.`
      : "Add a phrase you can use this week.",
    href: "/expressions",
    minutes: 5,
  };
}

/** Conversation first (the core loop), then due reviews, then one Studio suggestion. */
export function buildTodayPlan(input: PlanInput): Recommendation[] {
  return [conversation(input), review(input.dueReviewCount), studio(input)].filter(
    (r): r is Recommendation => r !== null,
  );
}
