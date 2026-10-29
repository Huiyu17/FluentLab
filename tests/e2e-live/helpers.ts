import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Shared setup for live E2E: a throwaway onboarded user per spec file, deleted afterwards
// (all their rows cascade). Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export const admin =
  url && serviceRoleKey ? createClient(url, serviceRoleKey, { auth: { persistSession: false } }) : null;

export type LiveUser = { id: string; email: string; password: string };

/** Call at the top of a spec file: skips without credentials, creates and deletes the user. */
export function useLiveUser(): () => LiveUser {
  test.skip(!admin, "Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  let user: LiveUser | null = null;

  test.beforeAll(async () => {
    const email = `e2e-live-${randomBytes(6).toString("hex")}@example.com`;
    const password = randomBytes(18).toString("base64url");
    const created = await admin!.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw new Error(`createUser: ${created.error.message}`);
    user = { id: created.data.user.id, email, password };
    const { error } = await admin!
      .from("profiles")
      .update({
        display_name: "E2E",
        english_level: "upper_intermediate",
        contexts: ["campus"],
        timezone: "America/New_York",
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error) throw new Error(`onboard: ${error.message}`);
  });

  test.afterAll(async () => {
    if (user) await admin!.auth.admin.deleteUser(user.id);
  });

  return () => {
    if (!user) throw new Error("Live user not created yet");
    return user;
  };
}

export async function signIn(page: Page, user: LiveUser) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today$/);
}
