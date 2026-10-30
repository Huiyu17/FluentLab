import "server-only";

import { z } from "zod";
import { ScenarioSnapshotSchema } from "@/lib/domain/conversation";
import {
  EVENT_TYPES,
  EVIDENCE_MIN_CONFIDENCE,
  GAP_STATUSES,
  type EventType,
  type GapStatus,
} from "@/lib/domain/gaps";
import type { GapSeverity } from "@/lib/domain/recommendations";
import { createClient } from "@/lib/supabase/server";

export type GapSummary = {
  id: string;
  title: string;
  description: string;
  status: Exclude<GapStatus, "emerging">;
  severity: GapSeverity;
  evidenceCount: number;
  conversationsCount: number;
  lastDetectedAt: string | null;
};

export type GapEvidence = {
  id: string;
  eventType: EventType;
  original: string;
  suggestion: string | null;
  context: string;
  createdAt: string;
  conversationId: string;
  conversationTitle: string;
};

export type GapDetail = GapSummary & {
  firstDetectedAt: string | null;
  /** Negative evidence, newest first. */
  evidence: GapEvidence[];
  /** Good usages, newest first. */
  goodUsages: GapEvidence[];
};

/** Most evidence rows shown on a gap page (each list). */
export const GAP_EVIDENCE_LIMIT = 20;

const ShownStatusSchema = z.enum(GAP_STATUSES).exclude(["emerging"]);
const SeveritySchema = z.enum(["low", "medium", "high"]);
const EventTypeSchema = z.enum(EVENT_TYPES);

const GAP_COLUMNS =
  "id, title, description, status, severity, evidence_count, conversations_count, last_detected_at, first_detected_at";

function fail(label: string, error: { code?: string }): never {
  console.error(`[gaps] ${label} failed`, { code: error.code });
  throw new Error(`Could not load ${label}.`);
}

type GapRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  evidence_count: number;
  conversations_count: number;
  last_detected_at: string | null;
};

function toSummary(row: GapRow): GapSummary | null {
  const status = ShownStatusSchema.safeParse(row.status);
  const severity = SeveritySchema.safeParse(row.severity);
  if (!status.success || !severity.success) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: status.data,
    severity: severity.data,
    evidenceCount: row.evidence_count,
    conversationsCount: row.conversations_count,
    lastDetectedAt: row.last_detected_at,
  };
}

const SEVERITY_ORDER: Record<GapSeverity, number> = { high: 0, medium: 1, low: 2 };

/**
 * The learner's gaps for the Gap Tracker: everything except `emerging` (below the display
 * threshold), highest severity and most recent first. Null when Supabase is not configured.
 */
export async function listGaps(userId: string): Promise<GapSummary[] | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("language_gaps")
    .select(GAP_COLUMNS)
    .eq("user_id", userId)
    .neq("status", "emerging");
  if (error) fail("gaps", error);
  return (data ?? [])
    .flatMap((row) => toSummary(row) ?? [])
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        (b.lastDetectedAt ?? "").localeCompare(a.lastDetectedAt ?? "") ||
        a.title.localeCompare(b.title),
    );
}

/**
 * One gap with its evidence (confidence ≥ 0.6, like the counts) and the conversations it came
 * from. Null if it doesn't exist, isn't the learner's, or is still `emerging`.
 */
export async function getGap(userId: string, gapId: string): Promise<GapDetail | null> {
  if (!z.uuid().safeParse(gapId).success) return null;
  const supabase = await createClient();
  if (!supabase) return null;

  const [gap, events] = await Promise.all([
    supabase.from("language_gaps").select(GAP_COLUMNS).eq("user_id", userId).eq("id", gapId).maybeSingle(),
    supabase
      .from("language_events")
      .select("id, event_type, original, suggestion, context, created_at, conversation_id")
      .eq("user_id", userId)
      .eq("gap_id", gapId)
      .gte("confidence", EVIDENCE_MIN_CONFIDENCE)
      .order("created_at", { ascending: false })
      .limit(GAP_EVIDENCE_LIMIT * 2),
  ]);
  if (gap.error) fail("gap", gap.error);
  if (events.error) fail("gap evidence", events.error);
  const summary = gap.data ? toSummary(gap.data) : null;
  if (!summary || !gap.data) return null;

  const conversationIds = [...new Set((events.data ?? []).map((e) => e.conversation_id))];
  const titles = new Map<string, string>();
  if (conversationIds.length > 0) {
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("id, scenario_snapshot")
      .eq("user_id", userId)
      .in("id", conversationIds);
    if (error) fail("gap conversations", error);
    for (const c of conversations ?? []) {
      const snapshot = ScenarioSnapshotSchema.safeParse(c.scenario_snapshot);
      titles.set(c.id, snapshot.success ? snapshot.data.title : "Conversation");
    }
  }

  const evidence = (events.data ?? []).flatMap((e): GapEvidence[] => {
    const eventType = EventTypeSchema.safeParse(e.event_type);
    if (!eventType.success) return [];
    return [
      {
        id: e.id,
        eventType: eventType.data,
        original: e.original,
        suggestion: e.suggestion,
        context: e.context,
        createdAt: e.created_at,
        conversationId: e.conversation_id,
        conversationTitle: titles.get(e.conversation_id) ?? "Conversation",
      },
    ];
  });

  return {
    ...summary,
    firstDetectedAt: gap.data.first_detected_at,
    evidence: evidence.filter((e) => e.eventType !== "good_usage").slice(0, GAP_EVIDENCE_LIMIT),
    goodUsages: evidence.filter((e) => e.eventType === "good_usage").slice(0, GAP_EVIDENCE_LIMIT),
  };
}
