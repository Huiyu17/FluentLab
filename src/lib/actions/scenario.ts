"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ScenarioFormState } from "@/lib/actions/scenario-state";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import {
  CustomScenarioSchema,
  MAX_CUSTOM_SCENARIOS,
  customScenarioValues,
  toScenarioRow,
  type CustomScenarioField,
} from "@/lib/validation/scenario";

const SAVE_FAILED: ScenarioFormState = {
  status: "error",
  message: "We couldn't save your scenario. Please try again.",
};
const NEEDS_ACCOUNT: ScenarioFormState = {
  status: "error",
  message: "Saving needs an account: Supabase is not configured for this app.",
};

function parseForm(formData: FormData) {
  const parsed = CustomScenarioSchema.safeParse(customScenarioValues(formData));
  if (parsed.success) return { data: parsed.data } as const;
  const fieldErrors: Partial<Record<CustomScenarioField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as CustomScenarioField;
    fieldErrors[field] ??= issue.message;
  }
  return { state: { status: "error", fieldErrors } satisfies ScenarioFormState } as const;
}

export async function createScenarioAction(
  _prev: ScenarioFormState,
  formData: FormData,
): Promise<ScenarioFormState> {
  const user = await requireUser("/simulator/custom");
  const parsed = parseForm(formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  if (!supabase) return NEEDS_ACCOUNT;

  const { count, error: countError } = await supabase
    .from("scenarios")
    .select("id", { count: "exact", head: true })
    .eq("is_custom", true)
    .eq("created_by", user.id);
  if (countError) {
    console.error("[scenario] count failed", { code: countError.code });
    return SAVE_FAILED;
  }
  if ((count ?? 0) >= MAX_CUSTOM_SCENARIOS) {
    return {
      status: "error",
      message: `You can keep up to ${MAX_CUSTOM_SCENARIOS} scenarios. Delete one you no longer need first.`,
    };
  }

  // Ownership and kind are set here, never taken from the form.
  const { data, error } = await supabase
    .from("scenarios")
    .insert({ ...toScenarioRow(parsed.data), category: "custom", is_custom: true, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[scenario] create failed", { code: error?.code });
    return SAVE_FAILED;
  }
  redirect(`/simulator/custom/${data.id}`);
}

export async function updateScenarioAction(
  _prev: ScenarioFormState,
  formData: FormData,
): Promise<ScenarioFormState> {
  const id = z.uuid().safeParse(formData.get("id"));
  const user = await requireUser(id.success ? `/simulator/custom/${id.data}/edit` : "/simulator");
  if (!id.success) return SAVE_FAILED;
  const parsed = parseForm(formData);
  if (parsed.state) return parsed.state;

  const supabase = await createClient();
  if (!supabase) return NEEDS_ACCOUNT;

  const { data, error } = await supabase
    .from("scenarios")
    .update(toScenarioRow(parsed.data))
    .eq("id", id.data)
    .eq("created_by", user.id)
    .eq("is_custom", true)
    .select("id");
  if (error) {
    console.error("[scenario] update failed", { code: error.code });
    return SAVE_FAILED;
  }
  if (!data?.length) return { status: "error", message: "This scenario no longer exists." };
  redirect(`/simulator/custom/${id.data}`);
}

export async function deleteScenarioAction(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("id"));
  const user = await requireUser("/simulator");
  const supabase = await createClient();
  if (!supabase || !id.success) redirect("/simulator");

  // Past conversations keep their scenario snapshot (scenario_id is set to null).
  const { error } = await supabase
    .from("scenarios")
    .delete()
    .eq("id", id.data)
    .eq("created_by", user.id)
    .eq("is_custom", true);
  if (error) {
    console.error("[scenario] delete failed", { code: error.code });
    throw new Error("Could not delete the scenario.");
  }
  redirect("/simulator");
}
