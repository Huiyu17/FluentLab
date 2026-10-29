/**
 * Only allow same-site relative paths as post-auth redirect targets, to prevent
 * open redirects (e.g. `?next=https://evil.example` or `//evil.example`).
 */
export function safeRedirectPath(value: unknown, fallback = "/today"): string {
  if (typeof value !== "string") return fallback;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(path)) return fallback;
  try {
    // Resolving against a dummy origin must not change the origin.
    const url = new URL(path, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
