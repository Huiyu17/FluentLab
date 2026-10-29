import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath, isSignedOutOnlyPath } from "@/lib/auth/routes";
import { getSupabaseEnv } from "./env";

/**
 * Refreshes the Supabase auth session cookie on each request and does the
 * optimistic redirects:
 * - signed out on a protected route → /login?next=<path>
 * - signed in on /login or /signup → /today
 *
 * Pass-through when Supabase is not configured. Real authorization always happens
 * in the data access layer and RLS, not here. The onboarding check needs a DB read,
 * so it lives in the (app) layout gate instead.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();
  if (!env) return response;

  let cacheHeaders: Record<string, string> = {};
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Auth-cookie responses must not be cached by a CDN.
        cacheHeaders = headers;
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims():
  // it validates the JWT and triggers a refresh when needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && isProtectedPath(pathname)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return redirectKeepingCookies(url, response, cacheHeaders);
  }

  if (signedIn && isSignedOutOnlyPath(pathname)) {
    return redirectKeepingCookies(new URL("/today", request.url), response, cacheHeaders);
  }

  return response;
}

/** A redirect that still carries any refreshed (or cleared) session cookies. */
function redirectKeepingCookies(
  url: URL,
  response: NextResponse,
  cacheHeaders: Record<string, string>,
): NextResponse {
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  Object.entries(cacheHeaders).forEach(([key, value]) => redirect.headers.set(key, value));
  return redirect;
}
