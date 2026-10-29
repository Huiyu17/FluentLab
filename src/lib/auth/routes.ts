/**
 * Route groups used by the proxy's optimistic redirects. Kept free of React/icon
 * imports so the proxy bundle stays small. tests/unit/auth-routes.test.ts checks
 * that every sidebar destination is protected.
 */

/** Signed-in area: the (app) route group plus onboarding. */
export const PROTECTED_PREFIXES = [
  "/today",
  "/vocabulary",
  "/expressions",
  "/my-english",
  "/simulator",
  "/conversations",
  "/debrief",
  "/gaps",
  "/profile",
  "/settings",
  "/onboarding",
] as const;

/** Pages a signed-in user has no reason to see. */
export const SIGNED_OUT_ONLY = ["/login", "/signup"] as const;

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => matches(pathname, prefix));
}

export function isSignedOutOnlyPath(pathname: string): boolean {
  return SIGNED_OUT_ONLY.some((prefix) => matches(pathname, prefix));
}
