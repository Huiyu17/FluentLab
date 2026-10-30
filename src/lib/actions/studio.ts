"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AI_ERROR_MESSAGES, AIError } from "@/lib/ai/errors";
import { configuredProviderName } from "@/lib/ai/provider";
import { consumeAiQuota } from "@/lib/ai/quota";
import { StudioCardSchema } from "@/lib/ai/schemas/studio";
import { explainExpression } from "@/lib/ai/services/studio";
import type { SaveItemState, StudioState } from "@/lib/actions/studio-state";
import { getAuthState, getCurrentProfile, requireUser } from "@/lib/auth/dal";
import { likeExact } from "@/lib/items";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { safeRedirectPath } from "@/lib/validation/redirect";
import { StudioInputSchema } from "@/lib/validation/studio";

type Client = SupabaseClient<Database>;

const SAVE_FAILED = "We couldn't save that. Please try again.";
const NEEDS_ACCOUNT = "Saving needs an account: Supabase is not configured for this app.";

async function findSavedItemId(supabase: Client, userId: string, expression: string) {
  const { data } = await supabase
    .from("learning_items")
    .select("id")
    .eq("user_id", userId)
    .ilike("expression", likeExact(expression.trim()))
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function explainExpressionAction(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const parsed = StudioInputSchema.safeParse({
    expression: formData.get("expression"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Type a word or phrase." };
  }

  const auth = await getAuthState();
  let supabase: Client | null = null;
  let userId: string | null = null;
  let learner = { nativeLanguage: null as string | null, englishLevel: null as string | null };

  if (auth.status === "unconfigured") {
    // Without Supabase there is no quota, so only the mock provider may run.
    if (configuredProviderName() !== "mock") {
      return { status: "error", message: AI_ERROR_MESSAGES.not_configured };
    }
  } else {
    const user = await requireUser(parsed.data.kind === "vocabulary" ? "/vocabulary" : "/expressions");
    supabase = await createClient();
    userId = user.id;
    const profile = await getCurrentProfile();
    learner = {
      nativeLanguage: profile?.nativeLanguage ?? null,
      englishLevel: profile?.englishLevel ?? null,
    };
  }

  try {
    const client = supabase;
    const { card, sample } = await explainExpression(parsed.data, {
      learner,
      consumeQuota: client ? () => consumeAiQuota(client) : async () => {},
    });
    const savedItemId = client && userId ? await findSavedItemId(client, userId, card.expression) : null;
    return { status: "result", kind: parsed.data.kind, card, sample, savedItemId, resultAt: Date.now() };
  } catch (error) {
    if (error instanceof AIError) return { status: "error", message: AI_ERROR_MESSAGES[error.code] };
    console.error("[studio] explain failed", { name: error instanceof Error ? error.name : "unknown" });
    return { status: "error", message: AI_ERROR_MESSAGES.provider_down };
  }
}

const CARD_JSON_MAX = 20_000;

/** Saves a Studio card the learner is looking at. The card comes back from the client, so it is re-validated. */
export async function saveStudioCardAction(_prev: SaveItemState, formData: FormData): Promise<SaveItemState> {
  const raw = formData.get("card");
  if (typeof raw !== "string" || raw.length > CARD_JSON_MAX) return { status: "error", message: SAVE_FAILED };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { status: "error", message: SAVE_FAILED };
  }
  const parsed = StudioCardSchema.safeParse(json);
  if (!parsed.success) return { status: "error", message: SAVE_FAILED };
  const card = parsed.data;

  const user = await requireUser(card.type === "word" ? "/vocabulary" : "/expressions");
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: NEEDS_ACCOUNT };

  const { data, error } = await supabase
    .from("learning_items")
    .insert({
      user_id: user.id,
      type: card.type,
      expression: card.expression,
      meaning: card.coreMeaning,
      native_meaning: card.nativeMeaning,
      example: card.examples[0] ?? null,
      details: card,
      source: "studio",
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const existing = await findSavedItemId(supabase, user.id, card.expression);
    if (existing) return { status: "saved", itemId: existing, alreadySaved: true };
  }
  if (error || !data) {
    console.error("[studio] save failed", { code: error?.code });
    return { status: "error", message: SAVE_FAILED };
  }
  refresh();
  return { status: "saved", itemId: data.id, alreadySaved: false };
}

export async function addCuratedAction(_prev: SaveItemState, formData: FormData): Promise<SaveItemState> {
  const curatedId = z.uuid().safeParse(formData.get("curatedId"));
  if (!curatedId.success) return { status: "error", message: SAVE_FAILED };

  const user = await requireUser("/expressions");
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: NEEDS_ACCOUNT };

  const { data: curated, error: readError } = await supabase
    .from("curated_expressions")
    .select("id, expression, meaning, used_when, example, register, frequency")
    .eq("id", curatedId.data)
    .maybeSingle();
  if (readError || !curated) return { status: "error", message: SAVE_FAILED };

  const { data, error } = await supabase
    .from("learning_items")
    .insert({
      user_id: user.id,
      type: "expression",
      expression: curated.expression,
      meaning: curated.meaning,
      example: curated.example,
      details: { usedWhen: curated.used_when, register: curated.register, frequency: curated.frequency },
      source: "curated",
      source_curated_id: curated.id,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const existing = await findSavedItemId(supabase, user.id, curated.expression);
    if (existing) return { status: "saved", itemId: existing, alreadySaved: true };
  }
  if (error || !data) {
    console.error("[studio] add curated failed", { code: error?.code });
    return { status: "error", message: SAVE_FAILED };
  }
  refresh();
  return { status: "saved", itemId: data.id, alreadySaved: false };
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const itemId = z.uuid().safeParse(formData.get("itemId"));
  const back = safeRedirectPath(formData.get("back"), "/my-english");
  const user = await requireUser(back);
  const supabase = await createClient();
  if (!supabase || !itemId.success) redirect(back);

  const { error } = await supabase
    .from("learning_items")
    .delete()
    .eq("id", itemId.data)
    .eq("user_id", user.id);
  if (error) {
    console.error("[studio] delete failed", { code: error.code });
    throw new Error("Could not delete the item.");
  }
  redirect(back);
}
