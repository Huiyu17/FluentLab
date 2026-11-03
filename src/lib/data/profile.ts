import "server-only";

import { z } from "zod";
import { ScenarioSnapshotSchema } from "@/lib/domain/conversation";
import type { IndicatorPoint } from "@/lib/domain/indicators";
import { createClient } from "@/lib/supabase/server";

/** The newest this many reviews are charted. */
export const PROFILE_HISTORY_LIMIT = 60;

export type ProfilePoint = IndicatorPoint & { conversationId: string; title: string };

export type FluencyProfile = {
  /** Oldest first. */
  points: ProfilePoint[];
  gaps: { active: number; improving: number; resolved: number };
};

const Score = z.number().int().min(0).max(100);

function fail(label: string, error: { code?: string }): never {
  console.error(`[profile] ${label} failed`, { code: error.code });
  throw new Error(`Could not load ${label}.`);
}

/** Indicator history from conversation reviews, and gap counts. Null when Supabase is not configured. */
export async function getFluencyProfile(userId: string): Promise<FluencyProfile | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const [feedback, gaps] = await Promise.all([
    supabase
      .from("conversation_feedback")
      .select(
        "conversation_id, created_at, fluency_score, naturalness_score, grammar_score, vocabulary_score, confidence_score, conversations(scenario_snapshot)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(PROFILE_HISTORY_LIMIT),
    supabase
      .from("language_gaps")
      .select("status")
      .eq("user_id", userId)
      .in("status", ["active", "improving", "resolved"]),
  ]);
  if (feedback.error) fail("indicator history", feedback.error);
  if (gaps.error) fail("gap summary", gaps.error);

  const points = (feedback.data ?? []).flatMap((row): ProfilePoint[] => {
    const scores = z
      .object({ fluency: Score, naturalness: Score, grammar: Score, vocabulary: Score, confidence: Score })
      .safeParse({
        fluency: row.fluency_score,
        naturalness: row.naturalness_score,
        grammar: row.grammar_score,
        vocabulary: row.vocabulary_score,
        confidence: row.confidence_score,
      });
    if (!scores.success) return [];
    const snapshot = ScenarioSnapshotSchema.safeParse(row.conversations?.scenario_snapshot);
    return [
      {
        at: row.created_at,
        scores: scores.data,
        conversationId: row.conversation_id,
        title: snapshot.success ? snapshot.data.title : "Conversation",
      },
    ];
  });

  const count = (status: string) => (gaps.data ?? []).filter((g) => g.status === status).length;
  return {
    points: points.reverse(),
    gaps: { active: count("active"), improving: count("improving"), resolved: count("resolved") },
  };
}
