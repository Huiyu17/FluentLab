"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AI_ERROR_MESSAGES, AIError } from "@/lib/ai/errors";
import { consumeAiQuota } from "@/lib/ai/quota";
import { tutorOpening } from "@/lib/ai/services/tutor";
import type { StartConversationState } from "@/lib/actions/conversation-state";
import { getCurrentProfile, requireUser } from "@/lib/auth/dal";
import { listSavedItems } from "@/lib/data/items";
import { getCustomScenario, getSharedScenario } from "@/lib/data/scenarios";
import { toScenarioSnapshot } from "@/lib/domain/conversation";
import { pickTargetItems } from "@/lib/domain/targets";
import { createClient } from "@/lib/supabase/server";

const START_FAILED: StartConversationState = {
  status: "error",
  message: "We couldn't start the conversation. Please try again.",
};

/** An active conversation on the same scenario this recent is resumed instead of duplicated. */
const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

const SourceSchema = z.union([
  z.object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(100),
  }),
  z.object({ scenarioId: z.uuid() }),
]);

/**
 * Starts (or resumes) a conversation: snapshot of the scenario, target expressions from
 * My English, and the opening line as message 0. The opening line is settled first, so an AI
 * failure leaves nothing behind; a later write failure deletes the half-made conversation.
 */
export async function startConversationAction(
  _prev: StartConversationState,
  formData: FormData,
): Promise<StartConversationState> {
  const source = SourceSchema.safeParse({
    ...(formData.get("slug") ? { slug: formData.get("slug") } : {}),
    ...(formData.get("scenarioId") ? { scenarioId: formData.get("scenarioId") } : {}),
  });
  const back =
    source.success && "slug" in source.data
      ? `/simulator/${source.data.slug}`
      : `/simulator/custom/${source.success && "scenarioId" in source.data ? source.data.scenarioId : ""}`;
  const user = await requireUser(back);
  if (!source.success) return START_FAILED;

  const supabase = await createClient();
  if (!supabase)
    return { status: "error", message: "Conversations need an account: Supabase is not configured." };

  const scenario =
    "slug" in source.data
      ? await getSharedScenario(source.data.slug)
      : await getCustomScenario(user.id, source.data.scenarioId);
  if (!scenario) return { status: "error", message: "This scenario no longer exists." };

  // Resume instead of piling up unfinished conversations.
  const { data: active, error: activeError } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", user.id)
    .eq("scenario_id", scenario.id)
    .eq("status", "active")
    .gte("started_at", new Date(Date.now() - RESUME_WINDOW_MS).toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) {
    console.error("[conversation] resume lookup failed", { code: activeError.code });
    return START_FAILED;
  }
  if (active) redirect(`/conversations/${active.id}`);

  const [profile, items] = await Promise.all([getCurrentProfile(), listSavedItems(user.id)]);
  const targets = pickTargetItems(items ?? [], new Date());
  const snapshot = toScenarioSnapshot(scenario);

  let opening = scenario.openingLine?.trim() ?? "";
  if (!opening) {
    try {
      opening = await tutorOpening(
        {
          scenario: snapshot,
          learner: {
            englishLevel: profile?.englishLevel ?? null,
            nativeLanguage: profile?.nativeLanguage ?? null,
          },
          targets: targets.map((t) => ({ expression: t.expression, meaning: t.meaning })),
        },
        { consumeQuota: () => consumeAiQuota(supabase) },
      );
    } catch (error) {
      if (error instanceof AIError) return { status: "error", message: AI_ERROR_MESSAGES[error.code] };
      console.error("[conversation] opening failed", {
        name: error instanceof Error ? error.name : "unknown",
      });
      return START_FAILED;
    }
  }

  const { data: conversation, error: createError } = await supabase
    .from("conversations")
    .insert({ user_id: user.id, scenario_id: scenario.id, scenario_snapshot: snapshot })
    .select("id")
    .single();
  if (createError || !conversation) {
    console.error("[conversation] create failed", { code: createError?.code });
    return START_FAILED;
  }

  const [targetsResult, messageResult] = await Promise.all([
    targets.length > 0
      ? supabase
          .from("conversation_targets")
          .insert(targets.map((t) => ({ conversation_id: conversation.id, user_id: user.id, item_id: t.id })))
      : Promise.resolve({ error: null }),
    supabase.from("messages").insert({
      conversation_id: conversation.id,
      user_id: user.id,
      role: "assistant",
      content: opening,
      seq: 0,
    }),
  ]);
  if (targetsResult.error || messageResult.error) {
    console.error("[conversation] setup failed", {
      targets: targetsResult.error?.code,
      message: messageResult.error?.code,
    });
    await supabase.from("conversations").delete().eq("id", conversation.id).eq("user_id", user.id);
    return START_FAILED;
  }

  redirect(`/conversations/${conversation.id}`);
}

/**
 * Ends the conversation with a conditional update (`.eq("status", "active")`), so a double click or a
 * second tab changes nothing. With something to review it becomes `reviewing` and the review page runs
 * the review; a conversation where the learner never wrote anything is `abandoned` instead.
 */
export async function endConversationAction(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("conversationId"));
  const user = await requireUser(id.success ? `/conversations/${id.data}` : "/today");
  if (!id.success) redirect("/today");
  const supabase = await createClient();
  if (!supabase) redirect(`/conversations/${id.data}`);

  const { count, error: countError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", id.data)
    .eq("user_id", user.id)
    .eq("role", "user");
  if (countError) {
    console.error("[conversation] end failed", { code: countError.code });
    throw new Error("Could not end the conversation.");
  }
  const nothingToReview = (count ?? 0) === 0;

  const { error } = await supabase
    .from("conversations")
    .update({ status: nothingToReview ? "abandoned" : "reviewing", ended_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error) {
    console.error("[conversation] end failed", { code: error.code });
    throw new Error("Could not end the conversation.");
  }
  redirect(nothingToReview ? `/conversations/${id.data}` : `/conversations/${id.data}/review`);
}
