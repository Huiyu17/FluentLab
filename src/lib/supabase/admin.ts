import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

/**
 * Service-role client: BYPASSES RLS.
 * Only for trusted scripts (seeding, maintenance). Never import from pages,
 * components, Server Actions or Route Handlers that act on behalf of a user.
 */
export function createAdminClient(): SupabaseClient {
  const env = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!env || !serviceRoleKey) {
    throw new Error("Admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createSupabaseClient(env.url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
