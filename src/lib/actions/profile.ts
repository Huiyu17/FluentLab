"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { ProfileField, ProfileFormState } from "@/lib/actions/profile-state";
import { ProfileSchema, profileFormValues, toProfileRow } from "@/lib/validation/profile";

const SAVE_FAILED: ProfileFormState = {
  status: "error",
  message: "We couldn't save your profile. Please try again.",
};

/**
 * Validates and saves the signed-in user's profile. RLS ("profiles update own")
 * and the column grant limit the update to the caller's own editable columns;
 * the explicit id filter keeps the intent obvious.
 */
async function saveProfile(
  formData: FormData,
  { complete }: { complete: boolean },
): Promise<ProfileFormState> {
  const user = await requireUser(complete ? "/onboarding" : "/settings");

  const parsed = ProfileSchema.safeParse(profileFormValues(formData));
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Partial<Record<ProfileField, string[]>>;
    const fieldErrors: Partial<Record<ProfileField, string>> = {};
    for (const [field, messages] of Object.entries(flat) as [ProfileField, string[] | undefined][]) {
      if (messages?.[0]) fieldErrors[field] = messages[0];
    }
    return { status: "error", fieldErrors };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { status: "error", message: "Saving isn't available: Supabase is not configured for this app." };
  }

  const row = {
    ...toProfileRow(parsed.data),
    ...(complete ? { onboarded_at: new Date().toISOString() } : {}),
  };
  const { data, error } = await supabase.from("profiles").update(row).eq("id", user.id).select("id");

  if (error) {
    console.error("[profile] update failed", { code: error.code });
    return SAVE_FAILED;
  }
  // No row: the sign-up trigger didn't create a profile. Users can't insert one themselves.
  if (!data?.length) {
    console.error("[profile] update matched no row", { userId: user.id });
    return SAVE_FAILED;
  }

  if (complete) redirect("/today");
  // Re-render the current route so the sidebar shows the new name.
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function completeOnboarding(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  return saveProfile(formData, { complete: true });
}

export async function updateProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  return saveProfile(formData, { complete: false });
}
