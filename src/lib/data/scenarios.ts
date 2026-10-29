import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ENGLISH_LEVELS, type EnglishLevel } from "@/lib/validation/profile";
import { SCENARIO_CATEGORIES, type ScenarioCategory } from "@/lib/validation/scenario";

export type Scenario = {
  id: string;
  /** Shared scenarios only; custom scenarios are addressed by id. */
  slug: string | null;
  category: ScenarioCategory;
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  aiPersonality: string;
  goal: string;
  difficulty: EnglishLevel;
  openingLine: string | null;
  estMinutes: number;
  isCustom: boolean;
};

// system_prompt is trusted server-side configuration for shared scenarios; it is never selected here.
const COLUMNS =
  "id, slug, category, title, description, user_role, ai_role, ai_personality, goal, difficulty, opening_line, est_minutes, is_custom";

const RowSchema = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  category: z.enum(SCENARIO_CATEGORIES),
  title: z.string(),
  description: z.string(),
  user_role: z.string(),
  ai_role: z.string(),
  ai_personality: z.string(),
  goal: z.string(),
  difficulty: z.enum(ENGLISH_LEVELS),
  opening_line: z.string().nullable(),
  est_minutes: z.number(),
  is_custom: z.boolean(),
});

function toScenario(row: unknown): Scenario | null {
  const parsed = RowSchema.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id,
    slug: r.slug,
    category: r.category,
    title: r.title,
    description: r.description,
    userRole: r.user_role,
    aiRole: r.ai_role,
    aiPersonality: r.ai_personality,
    goal: r.goal,
    difficulty: r.difficulty,
    openingLine: r.opening_line,
    estMinutes: r.est_minutes,
    isCustom: r.is_custom,
  };
}

function fail(label: string, error: { code?: string }): never {
  console.error(`[scenarios] ${label} failed`, { code: error.code });
  throw new Error(`Could not load ${label}.`);
}

/** Shared catalog plus the learner's own scenarios. Null when Supabase is not configured. */
export async function listScenarios(
  userId: string,
): Promise<{ shared: Scenario[]; custom: Scenario[] } | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const [shared, custom] = await Promise.all([
    supabase.from("scenarios").select(COLUMNS).eq("is_custom", false).order("title"),
    supabase
      .from("scenarios")
      .select(COLUMNS)
      .eq("is_custom", true)
      .eq("created_by", userId)
      .order("created_at", { ascending: false }),
  ]);
  if (shared.error) fail("scenarios", shared.error);
  if (custom.error) fail("custom scenarios", custom.error);
  return {
    shared: (shared.data ?? []).flatMap((row) => toScenario(row) ?? []),
    custom: (custom.data ?? []).flatMap((row) => toScenario(row) ?? []),
  };
}

export async function getSharedScenario(slug: string): Promise<Scenario | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("scenarios")
    .select(COLUMNS)
    .eq("is_custom", false)
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail("scenario", error);
  return data ? toScenario(data) : null;
}

/** The learner's own custom scenario, or null (missing, malformed id, or someone else's). */
export async function getCustomScenario(userId: string, id: string): Promise<Scenario | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("scenarios")
    .select(COLUMNS)
    .eq("is_custom", true)
    .eq("created_by", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("custom scenario", error);
  return data ? toScenario(data) : null;
}
