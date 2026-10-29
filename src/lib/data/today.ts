import "server-only";

import { z } from "zod";
import type { Profile } from "@/lib/auth/dal";
import { buildTodayPlan, rankGaps, type PlanGap, type Recommendation } from "@/lib/domain/recommendations";
import { dayKey, summarizeStreak, type DayKey, type StreakSummary } from "@/lib/domain/streak";
import { SCORE_DIMENSIONS, type ScoreDimension } from "@/lib/domain/taxonomy";
import { createClient } from "@/lib/supabase/server";
import { LEARNING_CONTEXTS } from "@/lib/validation/profile";

/** How far back the streak looks. Longer streaks show as this many days. */
export const STREAK_WINDOW_DAYS = 90;
const ACTIVITY_ROW_LIMIT = 1000;
const RECENT_LIMIT = 5;
export const FOCUS_GAP_LIMIT = 3;

// `emerging` gaps are below the display threshold (docs/AI_SYSTEM.md → Gap detection).
const SHOWN_GAP_STATUSES = ["active", "improving"] as const;

export type FocusGap = PlanGap & {
  description: string;
  status: (typeof SHOWN_GAP_STATUSES)[number];
  conversationsCount: number;
};

export type ActivityItem =
  | {
      kind: "conversation";
      id: string;
      title: string;
      status: ConversationStatus;
      at: string;
      score: number | null;
      href: string;
    }
  | { kind: "debrief"; id: string; title: string; at: string; href: string };

export type Indicators = {
  conversationId: string;
  at: string;
  overallLabel: OverallLabel;
  scores: Record<ScoreDimension, number>;
};

export type TodayData = {
  today: DayKey;
  plan: Recommendation[];
  planMinutes: number;
  dailyGoalMinutes: number;
  streak: StreakSummary;
  reviews: { dueCount: number; totalCount: number; nextDueAt: string | null };
  focusGaps: FocusGap[];
  openGapCount: number;
  recentActivity: ActivityItem[];
  indicators: Indicators | null;
};

// The generated types say `string` for check-constrained columns; narrow them here.
const ConversationStatusSchema = z.enum(["active", "reviewing", "completed", "failed_review", "abandoned"]);
type ConversationStatus = z.infer<typeof ConversationStatusSchema>;
const OverallLabelSchema = z.enum(["needs_work", "developing", "good_communication", "strong"]);
type OverallLabel = z.infer<typeof OverallLabelSchema>;

const GapRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(SHOWN_GAP_STATUSES),
  severity: z.enum(["low", "medium", "high"]),
  evidence_count: z.number(),
  conversations_count: z.number(),
  last_detected_at: z.string().nullable(),
  created_at: z.string(),
});

const ScenarioRowSchema = z.object({
  slug: z.string(),
  title: z.string(),
  category: z.enum([...LEARNING_CONTEXTS, "custom"]),
  est_minutes: z.number(),
});

// Written by the app when a conversation starts (M6); tolerate older or partial shapes.
const ScenarioSnapshotSchema = z.object({ title: z.string().optional() }).catch({});

class TodayQueryError extends Error {}

type QueryError = { code?: string } | null;

/** Throws on a query error, logging only the error code. */
function check(label: string, error: QueryError): void {
  if (error) {
    console.error(`[today] ${label} query failed`, { code: error.code });
    throw new TodayQueryError(`Could not load ${label}.`);
  }
}

function unwrap<T>(label: string, result: { data: T[] | null; error: QueryError }): T[] {
  check(label, result.error);
  return result.data ?? [];
}

function count(label: string, result: { count: number | null; error: QueryError }): number {
  check(label, result.error);
  return result.count ?? 0;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Everything the Today page shows, read as the signed-in user (RLS applies; the explicit
 * user filters keep the intent obvious and use the per-user indexes).
 * Returns null when Supabase is not configured. Throws when a query fails.
 */
export async function getTodayData(
  userId: string,
  profile: Pick<Profile, "contexts" | "dailyGoalMinutes" | "timezone">,
  now: Date = new Date(),
): Promise<TodayData | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const nowIso = now.toISOString();
  const since = new Date(now.getTime() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [
    dueResult,
    totalResult,
    nextDueResult,
    gapsResult,
    scenariosResult,
    conversationsResult,
    debriefsResult,
    completedResult,
    reviewLogsResult,
    feedbackResult,
  ] = await Promise.all([
    supabase
      .from("learning_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("next_review_at", nowIso),
    supabase.from("learning_items").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("learning_items")
      .select("next_review_at")
      .eq("user_id", userId)
      .gt("next_review_at", nowIso)
      .order("next_review_at", { ascending: true })
      .limit(1),
    supabase
      .from("language_gaps")
      .select(
        "id, title, description, status, severity, evidence_count, conversations_count, last_detected_at, created_at",
      )
      .eq("user_id", userId)
      .in("status", [...SHOWN_GAP_STATUSES]),
    supabase.from("scenarios").select("slug, title, category, est_minutes").eq("is_custom", false),
    supabase
      .from("conversations")
      .select(
        "id, status, started_at, completed_at, overall_score, scenario_snapshot, scenarios(slug, title)",
      )
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from("debriefs")
      .select("id, situation, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_ROW_LIMIT),
    supabase
      .from("conversations")
      .select("completed_at")
      .eq("user_id", userId)
      .gte("completed_at", since)
      .limit(ACTIVITY_ROW_LIMIT),
    supabase
      .from("review_logs")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_ROW_LIMIT),
    supabase
      .from("conversation_feedback")
      .select(
        "conversation_id, created_at, overall_label, fluency_score, naturalness_score, grammar_score, vocabulary_score, confidence_score",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const dueCount = count("due reviews", dueResult);
  const totalCount = count("saved items", totalResult);
  const nextDueAt = unwrap("next review", nextDueResult)[0]?.next_review_at ?? null;

  const gaps: FocusGap[] = unwrap("gaps", gapsResult).flatMap((row) => {
    const parsed = GapRowSchema.safeParse(row);
    if (!parsed.success) return [];
    const gap = parsed.data;
    return [
      {
        id: gap.id,
        title: gap.title,
        description: gap.description,
        status: gap.status,
        severity: gap.severity,
        evidenceCount: gap.evidence_count,
        conversationsCount: gap.conversations_count,
        lastDetectedAt: gap.last_detected_at ?? gap.created_at,
      },
    ];
  });
  const rankedGaps = rankGaps(gaps);

  const scenarios = unwrap("scenarios", scenariosResult).flatMap((row) => {
    const parsed = ScenarioRowSchema.safeParse(row);
    return parsed.success
      ? [
          {
            slug: parsed.data.slug,
            title: parsed.data.title,
            category: parsed.data.category,
            estMinutes: parsed.data.est_minutes,
          },
        ]
      : [];
  });

  const conversations = unwrap("conversations", conversationsResult);
  const debriefs = unwrap("debriefs", debriefsResult);

  const today = dayKey(now, profile.timezone);
  const plan = buildTodayPlan({
    contexts: profile.contexts,
    dueReviewCount: dueCount,
    gaps: rankedGaps,
    scenarios,
    recentScenarioSlugs: conversations.flatMap((c) => (c.scenarios?.slug ? [c.scenarios.slug] : [])),
    today,
  });

  const streak = summarizeStreak(
    [
      ...unwrap("practice history", completedResult).flatMap((c) => (c.completed_at ? [c.completed_at] : [])),
      ...unwrap("review history", reviewLogsResult).map((r) => r.created_at),
      ...debriefs.map((d) => d.created_at),
    ],
    now,
    profile.timezone,
  );

  const recentActivity: ActivityItem[] = [
    ...conversations.map((c): ActivityItem => {
      const status = ConversationStatusSchema.catch("active").parse(c.status);
      return {
        kind: "conversation",
        id: c.id,
        title:
          c.scenarios?.title ?? ScenarioSnapshotSchema.parse(c.scenario_snapshot).title ?? "Conversation",
        status,
        at: c.completed_at ?? c.started_at,
        score: c.overall_score,
        href: status === "completed" ? `/conversations/${c.id}/review` : `/conversations/${c.id}`,
      };
    }),
    ...debriefs.slice(0, RECENT_LIMIT).map((d): ActivityItem => ({
      kind: "debrief",
      id: d.id,
      title: truncate(d.situation, 80),
      at: d.created_at,
      href: `/debrief/${d.id}`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, RECENT_LIMIT);

  const feedback = unwrap("indicators", feedbackResult)[0];
  const overallLabel = OverallLabelSchema.safeParse(feedback?.overall_label);
  const indicators: Indicators | null =
    feedback && overallLabel.success
      ? {
          conversationId: feedback.conversation_id,
          at: feedback.created_at,
          overallLabel: overallLabel.data,
          scores: Object.fromEntries(
            SCORE_DIMENSIONS.map((dimension) => [dimension, feedback[`${dimension}_score`]]),
          ) as Record<ScoreDimension, number>,
        }
      : null;

  return {
    today,
    plan,
    planMinutes: plan.reduce((sum, r) => sum + r.minutes, 0),
    dailyGoalMinutes: profile.dailyGoalMinutes,
    streak,
    reviews: { dueCount, totalCount, nextDueAt },
    focusGaps: rankedGaps.slice(0, FOCUS_GAP_LIMIT),
    openGapCount: rankedGaps.length,
    recentActivity,
    indicators,
  };
}
