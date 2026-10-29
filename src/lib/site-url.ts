const DEFAULT_SITE_URL = "http://localhost:3000";

/**
 * Public origin of the app, used to build links in auth emails. Must be listed in
 * Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export function getSiteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) return DEFAULT_SITE_URL;
  try {
    return new URL(value).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/** Absolute /auth/callback URL that returns the user to `next` after verifying an email link. */
export function authCallbackUrl(next: string): string {
  const url = new URL("/auth/callback", getSiteUrl());
  url.searchParams.set("next", next);
  return url.toString();
}
