import "server-only";

import { z } from "zod";
import { DebriefResultSchema, type DebriefResult } from "@/lib/ai/schemas/debrief";
import { createClient } from "@/lib/supabase/server";

export type DebriefSummary = {
  id: string;
  situation: string;
  createdAt: string;
  /** The custom scenario made from it with "Practice this situation", if any. */
  scenarioId: string | null;
};

/** Most debriefs listed on /debrief. */
export const DEBRIEF_LIST_LIMIT = 50;

function fail(label: string, error: { code?: string }): never {
  console.error(`[debriefs] ${label} failed`, { code: error.code });
  throw new Error(`Could not load ${label}.`);
}

/** The learner's debriefs, newest first. Null when Supabase is not configured. */
export async function listDebriefs(userId: string): Promise<DebriefSummary[] | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("debriefs")
    .select("id, situation, created_at, scenario_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(DEBRIEF_LIST_LIMIT);
  if (error) fail("debriefs", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    situation: row.situation,
    createdAt: row.created_at,
    scenarioId: row.scenario_id,
  }));
}

export type DebriefDetail = DebriefSummary & {
  whatYouSaid: string | null;
  result: DebriefResult;
  /** True when the mock provider wrote it: the page says it's a sample. */
  sample: boolean;
};

const StoredResultSchema = DebriefResultSchema.extend({ model: z.string() });

/**
 * One of the learner's debriefs with its validated result, or null if it doesn't exist, isn't
 * theirs (RLS), or its stored result no longer matches the schema.
 */
export async function getDebrief(userId: string, id: string): Promise<DebriefDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("debriefs")
    .select("id, situation, what_user_said, result, scenario_id, created_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("debrief", error);
  if (!data) return null;
  const stored = StoredResultSchema.safeParse(data.result);
  if (!stored.success) {
    console.error("[debriefs] stored result is invalid", { issues: stored.error.issues.length });
    return null;
  }
  const { model, ...result } = stored.data;
  return {
    id: data.id,
    situation: data.situation,
    whatYouSaid: data.what_user_said,
    createdAt: data.created_at,
    scenarioId: data.scenario_id,
    result,
    sample: model.startsWith("mock/"),
  };
}
