"use server";

import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authCallbackUrl } from "@/lib/site-url";
import type { AuthFormState } from "@/lib/actions/auth-state";
import { MagicLinkSchema, SignInSchema, SignUpSchema } from "@/lib/validation/auth";
import { safeRedirectPath } from "@/lib/validation/redirect";

const UNCONFIGURED: AuthFormState = {
  status: "error",
  message: "Sign-in isn't available yet: Supabase is not configured for this app.",
};

const RATE_LIMITED: AuthFormState = {
  status: "error",
  message: "Too many attempts. Please wait a minute and try again.",
};

function fieldErrors(error: z.ZodError): AuthFormState {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  return {
    status: "error",
    fieldErrors: {
      displayName: flat.displayName?.[0],
      email: flat.email?.[0],
      password: flat.password?.[0],
    },
  };
}

function isRateLimited(error: AuthError): boolean {
  return error.status === 429 || error.code?.startsWith("over_") === true;
}

/** Logs the Supabase error code for debugging; never logs emails or passwords. */
function logAuthError(action: string, error: AuthError) {
  console.error(`[auth] ${action} failed`, { code: error.code, status: error.status });
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = SignUpSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  if (!supabase) return UNCONFIGURED;

  const { email, password, displayName } = parsed.data;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the on_auth_user_created trigger into profiles.display_name.
      data: { display_name: displayName },
      emailRedirectTo: authCallbackUrl("/onboarding"),
    },
  });

  if (error) {
    logAuthError("signUp", error);
    if (isRateLimited(error)) return RATE_LIMITED;
    if (error.code === "weak_password") {
      return { status: "error", fieldErrors: { password: "Choose a stronger password." } };
    }
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { status: "error", message: "An account with this email already exists. Try signing in." };
    }
    return { status: "error", message: "We couldn't create your account. Please try again." };
  }

  // A session means email confirmation is off for this project: go straight to onboarding.
  if (data.session) redirect("/onboarding");

  // With confirmation on, Supabase answers the same way for new and existing emails,
  // so this message does not reveal whether an account exists.
  return { status: "check_email", email };
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  if (!supabase) return UNCONFIGURED;

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logAuthError("signIn", error);
    if (isRateLimited(error)) return RATE_LIMITED;
    if (error.code === "email_not_confirmed") {
      return { status: "error", message: "Confirm your email first. Check your inbox for the link we sent." };
    }
    if (error.code === "invalid_credentials") {
      return { status: "error", message: "That email and password don't match. Please try again." };
    }
    return { status: "error", message: "We couldn't sign you in. Please try again." };
  }

  redirect(safeRedirectPath(formData.get("next")));
}

export async function sendMagicLink(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = MagicLinkSchema.safeParse({ email: formData.get("email") ?? "" });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  if (!supabase) return UNCONFIGURED;

  const next = safeRedirectPath(formData.get("next"));
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    // Accounts are created on /signup (which collects a display name), not by magic link.
    options: { shouldCreateUser: false, emailRedirectTo: authCallbackUrl(next) },
  });

  if (error) {
    logAuthError("sendMagicLink", error);
    if (isRateLimited(error)) return RATE_LIMITED;
    if (error.status === undefined || error.status >= 500) {
      return { status: "error", message: "We couldn't send the link. Please try again." };
    }
    // Unknown emails land here as a 4xx ("Signups not allowed for otp"). Answer the
    // same way as success so the form does not reveal which emails have accounts.
  }

  return { status: "check_email", email: parsed.data.email };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) logAuthError("signOut", error);
  }
  redirect("/login");
}
