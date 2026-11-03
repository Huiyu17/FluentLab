"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  debriefFailure,
  type CreateDebriefState,
  type PracticeDebriefState,
} from "@/lib/actions/debrief-state";
import type { SaveItemState } from "@/lib/actions/studio-state";
import { AIError } from "@/lib/ai/errors";
import { consumeAiQuota } from "@/lib/ai/quota";
import { coachDebrief } from "@/lib/ai/services/debrief";
import { getCurrentProfile, requireUser } from "@/lib/auth/dal";
import { getDebrief } from "@/lib/data/debriefs";
import { likeExact } from "@/lib/items";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { DebriefInputSchema } from "@/lib/validation/debrief";
import { CustomScenarioSchema, MAX_CUSTOM_SCENARIOS, toScenarioRow } from "@/lib/validation/scenario";

const SAVE_FAILED = "We couldn't save your debrief. Please try again.";

/**
 * Debriefs a real situation: validate, spend quota, ask the coach, and only then save (decision
 * 2026-11-03: no draft or failed rows). On any failure nothing is written and the form keeps the
 * learner's text, so they can try again.
 */
export async function createDebriefAction(
  _prev: CreateDebriefState,
  formData: FormData,
): Promise<CreateDebriefState> {
  const parsed = DebriefInputSchema.safeParse({
    situation: formData.get("situation") ?? "",
    whatYouSaid: formData.get("whatYouSaid") ?? "",
  });
  if (!parsed.success) {
    // First message per field, the same way the scenario form reports errors.
    const fieldErrors: { situation?: string; whatYouSaid?: string } = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "situation" || field === "whatYouSaid") fieldErrors[field] ??= issue.message;
    }
    return { status: "error", fieldErrors };
  }

  const user = await requireUser("/debrief");
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Debriefs need an account: Supabase is not configured." };

  let stored: Json;
  try {
    const profile = await getCurrentProfile();
    const { result, model } = await coachDebrief(parsed.data, {
      learner: {
        englishLevel: profile?.englishLevel ?? null,
        nativeLanguage: profile?.nativeLanguage ?? null,
      },
      consumeQuota: () => consumeAiQuota(supabase),
    });
    stored = { ...result, model } as unknown as Json;
  } catch (error) {
    if (error instanceof AIError) return { status: "error", message: debriefFailure(error.code) };
    console.error("[debrief] coach failed", { name: error instanceof Error ? error.name : "unknown" });
    return { status: "error", message: debriefFailure("provider_down") };
  }

  const { data, error } = await supabase
    .from("debriefs")
    .insert({
      user_id: user.id,
      situation: parsed.data.situation,
      what_user_said: parsed.data.whatYouSaid,
      result: stored,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[debrief] save failed", { code: error?.code });
    return { status: "error", message: SAVE_FAILED };
  }
  redirect(`/debrief/${data.id}`);
}

const SaveExpressionSchema = z.object({
  debriefId: z.uuid(),
  index: z.coerce.number().int().min(0).max(2),
});
const StoredExpressionsSchema = z.object({
  expressions: z.array(z.object({ expression: z.string(), meaning: z.string() })),
  phrasings: z.array(z.object({ text: z.string() })),
  situationSummary: z.string(),
});
const SAVE_EXPRESSION_FAILED = "We couldn't save that. Please try again.";

/**
 * Saves one "expression worth saving" from a debrief to My English. The client sends only the
 * debrief id and the index; the text comes from the stored result (RLS: the learner's own), with
 * a phrasing that uses it as the example.
 */
export async function saveDebriefExpressionAction(
  _prev: SaveItemState,
  formData: FormData,
): Promise<SaveItemState> {
  const parsed = SaveExpressionSchema.safeParse({
    debriefId: formData.get("debriefId"),
    index: formData.get("index"),
  });
  if (!parsed.success) return { status: "error", message: SAVE_EXPRESSION_FAILED };

  const user = await requireUser(`/debrief/${parsed.data.debriefId}`);
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Saving needs an account: Supabase is not configured." };

  const { data: debrief, error: readError } = await supabase
    .from("debriefs")
    .select("id, result")
    .eq("id", parsed.data.debriefId)
    .eq("user_id", user.id)
    .maybeSingle();
  const stored = StoredExpressionsSchema.safeParse(debrief?.result);
  const picked = stored.success ? stored.data.expressions[parsed.data.index] : undefined;
  if (readError || !debrief || !stored.success || !picked?.expression.trim()) {
    if (readError) console.error("[debrief] save expression lookup failed", { code: readError.code });
    return { status: "error", message: SAVE_EXPRESSION_FAILED };
  }

  const expression = picked.expression.trim().slice(0, 200);
  const key = expression
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
  const example =
    stored.data.phrasings.find((p) => p.text.toLowerCase().includes(key))?.text ??
    stored.data.phrasings[0]?.text ??
    null;
  const { data, error } = await supabase
    .from("learning_items")
    .insert({
      user_id: user.id,
      type: "expression",
      expression,
      meaning: picked.meaning.trim().slice(0, 1000),
      example: example?.slice(0, 1000) ?? null,
      details: { debrief: { situationSummary: stored.data.situationSummary } },
      source: "debrief",
      source_debrief_id: debrief.id,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const { data: existing } = await supabase
      .from("learning_items")
      .select("id")
      .eq("user_id", user.id)
      .ilike("expression", likeExact(expression))
      .limit(1)
      .maybeSingle();
    if (existing) return { status: "saved", itemId: existing.id, alreadySaved: true };
  }
  if (error || !data) {
    console.error("[debrief] save expression failed", { code: error?.code });
    return { status: "error", message: SAVE_EXPRESSION_FAILED };
  }
  refresh();
  return { status: "saved", itemId: data.id, alreadySaved: false };
}

/** Deletes one of the learner's debriefs. Items saved from it stay in My English (the link is cleared). */
export async function deleteDebriefAction(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("debriefId"));
  const user = await requireUser("/debrief");
  const supabase = await createClient();
  if (!supabase || !id.success) redirect("/debrief");

  const { error } = await supabase.from("debriefs").delete().eq("id", id.data).eq("user_id", user.id);
  if (error) {
    console.error("[debrief] delete failed", { code: error.code });
    throw new Error("Could not delete the debrief.");
  }
  redirect("/debrief");
}

const PRACTICE_FAILED: PracticeDebriefState = {
  status: "error",
  message: "We couldn't create the practice scenario. Please try again.",
};

/**
 * "Practice this situation": turns the coach's scenario into the learner's own custom scenario,
 * links it to the debrief and opens its brief. Idempotent: a debrief that already has a scenario
 * opens that one, and if two clicks race, the loser deletes its copy and follows the winner.
 */
export async function practiceDebriefAction(
  _prev: PracticeDebriefState,
  formData: FormData,
): Promise<PracticeDebriefState> {
  const id = z.uuid().safeParse(formData.get("debriefId"));
  const user = await requireUser(id.success ? `/debrief/${id.data}` : "/debrief");
  if (!id.success) return PRACTICE_FAILED;
  const supabase = await createClient();
  if (!supabase)
    return { status: "error", message: "Practicing needs an account: Supabase is not configured." };

  const debrief = await getDebrief(user.id, id.data);
  if (!debrief) return { status: "error", message: "This debrief no longer exists." };
  if (debrief.scenarioId) redirect(`/simulator/custom/${debrief.scenarioId}`);

  // The same check as a scenario the learner writes by hand (a null opening line means "they open").
  const { scenario } = debrief.result;
  const parsed = CustomScenarioSchema.safeParse({ ...scenario, openingLine: scenario.openingLine ?? "" });
  if (!parsed.success) {
    console.error("[debrief] scenario failed validation", { issues: parsed.error.issues.length });
    return PRACTICE_FAILED;
  }

  const { count, error: countError } = await supabase
    .from("scenarios")
    .select("id", { count: "exact", head: true })
    .eq("is_custom", true)
    .eq("created_by", user.id);
  if (countError) {
    console.error("[debrief] scenario count failed", { code: countError.code });
    return PRACTICE_FAILED;
  }
  if ((count ?? 0) >= MAX_CUSTOM_SCENARIOS) {
    return {
      status: "error",
      message: `You can keep up to ${MAX_CUSTOM_SCENARIOS} scenarios. Delete one you no longer need first.`,
    };
  }

  const { data: created, error } = await supabase
    .from("scenarios")
    .insert({ ...toScenarioRow(parsed.data), category: "custom", is_custom: true, created_by: user.id })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[debrief] scenario create failed", { code: error?.code });
    return PRACTICE_FAILED;
  }

  // Claim the debrief only if no other request linked a scenario first.
  const { data: linked, error: linkError } = await supabase
    .from("debriefs")
    .update({ scenario_id: created.id })
    .eq("id", debrief.id)
    .eq("user_id", user.id)
    .is("scenario_id", null)
    .select("scenario_id");
  if (linkError || !linked?.length) {
    await supabase.from("scenarios").delete().eq("id", created.id).eq("created_by", user.id);
    if (linkError) {
      console.error("[debrief] scenario link failed", { code: linkError.code });
      return PRACTICE_FAILED;
    }
    const winner = await getDebrief(user.id, debrief.id);
    if (winner?.scenarioId) redirect(`/simulator/custom/${winner.scenarioId}`);
    return PRACTICE_FAILED;
  }
  redirect(`/simulator/custom/${created.id}`);
}
