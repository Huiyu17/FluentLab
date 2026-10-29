import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/validation/redirect";
import { ENGLISH_LEVELS, LEARNING_CONTEXTS } from "@/lib/validation/profile";

/**
 * Data access layer for the signed-in user.
 *
 * Every page, Server Action and Route Handler that acts for a user goes through
 * these helpers; the proxy redirect is only an optimistic UX shortcut. RLS is the
 * final guard. Results are memoized per request with React `cache` (not
 * `use cache: private`, whose browser-side copy would keep a stale `onboardedAt`
 * after the user finishes onboarding).
 */

export type CurrentUser = { id: string; email: string | null };

export type AuthState =
  { status: "unconfigured" } | { status: "signed_out" } | { status: "signed_in"; user: CurrentUser };

const PROFILE_COLUMNS =
  "id, display_name, native_language, english_level, learning_goal, contexts, daily_goal_minutes, timezone, onboarded_at";

// Until src/lib/supabase/types.ts is generated, validate the row shape at runtime.
const ProfileRowSchema = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  native_language: z.string().nullable(),
  english_level: z.enum(ENGLISH_LEVELS).nullable(),
  learning_goal: z.string().nullable(),
  contexts: z.array(z.enum(LEARNING_CONTEXTS)),
  daily_goal_minutes: z.number().int(),
  timezone: z.string(),
  onboarded_at: z.string().nullable(),
});

export type Profile = {
  id: string;
  displayName: string | null;
  nativeLanguage: string | null;
  englishLevel: (typeof ENGLISH_LEVELS)[number] | null;
  learningGoal: string | null;
  contexts: (typeof LEARNING_CONTEXTS)[number][];
  dailyGoalMinutes: number;
  timezone: string;
  onboardedAt: string | null;
};

/** Reads and verifies the session JWT (getClaims validates the signature; getSession does not). */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const supabase = await createClient();
  if (!supabase) return { status: "unconfigured" };

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { status: "signed_out" };

  return {
    status: "signed_in",
    user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null },
  };
});

/** The signed-in user, or null when signed out or Supabase is not configured. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const state = await getAuthState();
  return state.status === "signed_in" ? state.user : null;
}

/**
 * The signed-in user's profile, or null when signed out or when the profile row is
 * missing (the on_auth_user_created trigger should always create it).
 * Throws on database errors so they reach the error boundary instead of looking
 * like "not onboarded".
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load profile: ${error.message}`);
  if (!data) return null;

  const row = ProfileRowSchema.parse(data);
  return {
    id: row.id,
    displayName: row.display_name,
    nativeLanguage: row.native_language,
    englishLevel: row.english_level,
    learningGoal: row.learning_goal,
    contexts: row.contexts,
    dailyGoalMinutes: row.daily_goal_minutes,
    timezone: row.timezone,
    onboardedAt: row.onboarded_at,
  };
});

function loginPath(next?: string): string {
  if (!next) return "/login";
  return `/login?${new URLSearchParams({ next: safeRedirectPath(next) })}`;
}

/**
 * The signed-in user, or a redirect to /login. `next` is where to return after
 * signing in. In unconfigured mode this also redirects; the login page explains
 * that Supabase is not set up.
 */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath(next));
  return user;
}

/** A signed-in user who has finished onboarding, or a redirect to /login or /onboarding. */
export async function requireOnboardedUser(next?: string): Promise<{ user: CurrentUser; profile: Profile }> {
  const user = await requireUser(next);
  const profile = await getCurrentProfile();
  if (!profile?.onboardedAt) redirect("/onboarding");
  return { user, profile };
}
