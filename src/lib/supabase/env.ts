/**
 * Supabase public configuration. Returns null instead of throwing so the app
 * can run (and show a "not configured" notice) before a project exists.
 *
 * NEXT_PUBLIC_* values are inlined at build time, so they must be read with
 * literal property access.
 */
export type SupabaseEnv = { url: string; anonKey: string };

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}
