"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

const IdSchema = z.uuid();

/**
 * Dismisses a gap: the one status clients may set directly (RLS). Dismissed is sticky: new
 * evidence still attaches but no longer changes the status until the learner restores it.
 */
export async function dismissGapAction(formData: FormData): Promise<void> {
  const id = IdSchema.safeParse(formData.get("gapId"));
  const user = await requireUser(id.success ? `/gaps/${id.data}` : "/gaps");
  const supabase = await createClient();
  if (!id.success || !supabase) return;

  const { error } = await supabase
    .from("language_gaps")
    .update({ status: "dismissed" })
    .eq("id", id.data)
    .eq("user_id", user.id);
  if (error) {
    console.error("[gaps] dismiss failed", { code: error.code });
    throw new Error("Could not dismiss the gap.");
  }
  refresh();
}

/** Restores a dismissed gap; restore_gap() recomputes its status from the evidence. */
export async function restoreGapAction(formData: FormData): Promise<void> {
  const id = IdSchema.safeParse(formData.get("gapId"));
  await requireUser(id.success ? `/gaps/${id.data}` : "/gaps");
  const supabase = await createClient();
  if (!id.success || !supabase) return;

  const { error } = await supabase.rpc("restore_gap", { p_gap_id: id.data });
  // P0002: deleted or not the learner's; the page will show not-found after the refresh.
  if (error && error.code !== "P0002") {
    console.error("[gaps] restore failed", { code: error.code });
    throw new Error("Could not restore the gap.");
  }
  refresh();
}
