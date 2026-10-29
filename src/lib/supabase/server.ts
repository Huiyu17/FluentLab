import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getSupabaseEnv } from "./env";
import type { Database } from "./types";

/**
 * Per-request server client acting as the signed-in user (RLS applies).
 * Create a new one for every request; never share across requests.
 * Returns null when Supabase is not configured.
 */
export async function createClient(): Promise<SupabaseClient<Database> | null> {
  const env = getSupabaseEnv();
  if (!env) return null;

  // Supabase compares token expiry with Date.now(). Cookies alone don't stop
  // Cache Components from prerendering (dev's runtime prefetch check reads them),
  // so mark everything that uses this client as request-time only.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session cookie, so this is safe to ignore.
        }
      },
    },
  });
}
