"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

/** Browser client (anon key, user session from cookies). Null when unconfigured. */
export function createClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createBrowserClient(env.url, env.anonKey);
}
