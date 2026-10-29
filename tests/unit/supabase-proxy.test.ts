import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };
type CookieAdapter = {
  setAll: (cookies: CookieToSet[], headers: Record<string, string>) => void;
};

let claims: Record<string, unknown> | null = null;
let refreshedCookies: CookieToSet[] = [];

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, { cookies }: { cookies: CookieAdapter }) => ({
    auth: {
      getClaims: async () => {
        // Simulate a token refresh writing new session cookies.
        if (refreshedCookies.length)
          cookies.setAll(refreshedCookies, { "Cache-Control": "private, no-store" });
        return claims ? { data: { claims }, error: null } : { data: null, error: { message: "no session" } };
      },
    },
  }),
}));

const { updateSession } = await import("@/lib/supabase/proxy");

function request(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  claims = null;
  refreshedCookies = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("updateSession", () => {
  it("passes everything through in unconfigured mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const res = await updateSession(request("/today"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends signed-out users on app routes to /login with a return path", async () => {
    const res = await updateSession(request("/gaps/abc?tab=examples"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fgaps%2Fabc%3Ftab%3Dexamples",
    );
  });

  it("also protects /onboarding", async () => {
    const res = await updateSession(request("/onboarding"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fonboarding");
  });

  it("lets signed-out users see public, auth and unknown routes", async () => {
    for (const path of ["/", "/login", "/signup", "/auth/callback?code=x", "/does-not-exist"]) {
      expect((await updateSession(request(path))).headers.get("location"), path).toBeNull();
    }
  });

  it("sends signed-in users away from /login and /signup", async () => {
    claims = { sub: "user-1" };
    expect((await updateSession(request("/login"))).headers.get("location")).toBe(
      "http://localhost:3000/today",
    );
    expect((await updateSession(request("/signup"))).headers.get("location")).toBe(
      "http://localhost:3000/today",
    );
  });

  it("lets signed-in users through to app routes", async () => {
    claims = { sub: "user-1" };
    expect((await updateSession(request("/today"))).headers.get("location")).toBeNull();
  });

  it("keeps refreshed session cookies and no-store on redirects", async () => {
    claims = { sub: "user-1" };
    refreshedCookies = [{ name: "sb-test-auth-token", value: "fresh", options: { path: "/" } }];
    const res = await updateSession(request("/login"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/today");
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("fresh");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
