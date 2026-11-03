/**
 * Today plan: deterministic, rule-based recommendations (no LLM).
 *
 * One conversation, one review session when items are due and one Studio suggestion, each with a
 * human-readable reason. The conversation targets the highest-priority gap (docs/AI_SYSTEM.md →
 * Recommendations): severity weight × recency decay × not practiced in the last 2 days (M9).
 */
import type { DayKey } from "./streak";
import { LEARNING_CONTEXT_LABELS, type LearningContext } from "@/lib/validation/profile";

export type GapSeverity = "low" | "medium" | "high";

export type PlanGap = {
  id: string;
  title: string;
  /** Only open gaps are planned: emerging ones are hidden, resolved/dismissed ones are done. */
  status: "active" | "improving";
  severity: GapSeverity;
  evidenceCount: number;
  conversationsCount: number;
  lastDetectedAt: string;
  /** When a conversation that targeted this gap was last completed (derived, M9). */
  lastPracticedAt: string | null;
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
  /** Open gaps (active or improving). */
  gaps: readonly PlanGap[];
  /** Shared scenario catalog. */
  scenarios: readonly PlanScenario[];
  /** Slugs of the learner's most recent conversations, newest first. */
  recentScenarioSlugs: readonly string[];
  /** Today in the learner's time zone; rotates the suggestion from day to day. */
  today: DayKey;
  /** For gap priority (recency, recently practiced). */
  now: Date;
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
/** A gap's priority halves for every 14 days since it was last seen. */
export const RECENCY_HALF_LIFE_DAYS = 14;
/** A gap practiced (targeted, completed conversation) this recently… */
export const RECENTLY_PRACTICED_DAYS = 2;
/** …drops by this factor, so the plan moves on to something else instead of repeating it. */
export const RECENTLY_PRACTICED_FACTOR = 0.25;
/** Improving gaps still get practice, after the active ones of the same weight. */
export const IMPROVING_FACTOR = 0.5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** severity weight × recency decay × not practiced in the last 2 days (× improving factor). */
export function gapPriority(gap: PlanGap, now: Date): number {
  const sinceSeen = Math.max(0, now.getTime() - new Date(gap.lastDetectedAt).getTime()) / DAY_MS;
  const recency = 0.5 ** (sinceSeen / RECENCY_HALF_LIFE_DAYS);
  const practicedRecently =
    gap.lastPracticedAt !== null &&
    now.getTime() - new Date(gap.lastPracticedAt).getTime() < RECENTLY_PRACTICED_DAYS * DAY_MS;
  return (
    SEVERITY_WEIGHT[gap.severity] *
    recency *
    (practicedRecently ? RECENTLY_PRACTICED_FACTOR : 1) *
    (gap.status === "improving" ? IMPROVING_FACTOR : 1)
  );
}

/** Highest priority first; ties by more evidence, then most recently seen, then id (stable). */
export function rankGaps<T extends PlanGap>(gaps: readonly T[], now: Date): T[] {
  return [...gaps]
    .map((gap) => ({ gap, priority: gapPriority(gap, now) }))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.gap.evidenceCount - a.gap.evidenceCount ||
        b.gap.lastDetectedAt.localeCompare(a.gap.lastDetectedAt) ||
        a.gap.id.localeCompare(b.gap.id),
    )
    .map(({ gap }) => gap);
}

export function pickFocusGap<T extends PlanGap>(gaps: readonly T[], now: Date): T | null {
  return rankGaps(gaps, now)[0] ?? null;
}

/** Stable small hash so the same day always gives the same pick. */
function dayIndex(today: DayKey, length: number): number {
  let hash = 0;
  for (const char of today) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % length;
}

/**
 * A shared scenario to practice in: from the learner's contexts when possible, avoiding the last 3
 * practiced, rotating by day. Used for the plan and for "Practice this" on a gap (M9).
 */
export function pickScenario(
  input: Pick<PlanInput, "contexts" | "scenarios" | "recentScenarioSlugs" | "today">,
): PlanScenario | null {
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

  const gap = pickFocusGap(input.gaps, input.now);
  const contextLabel =
    scenario.category === "custom" ? null : LEARNING_CONTEXT_LABELS[scenario.category].label;
  const reason = gap
    ? `Practice "${gap.title}": seen ${gap.evidenceCount}× in ${gap.conversationsCount} ${
        gap.conversationsCount === 1 ? "conversation" : "conversations"
      }.`
    : contextLabel && input.contexts.includes(scenario.category as LearningContext)
      ? `Matches where you use English: ${contextLabel}.`
      : "A good everyday conversation to warm up with.";

  return {
    kind: "conversation",
    title: scenario.title,
    reason,
    // The brief shows this gap as the focus, and starting stores it as the conversation's target.
    href: gap ? `/simulator/${scenario.slug}?gap=${gap.id}` : `/simulator/${scenario.slug}`,
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
