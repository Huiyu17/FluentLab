import { describe, expect, it } from "vitest";
import { isProtectedPath, isSignedOutOnlyPath } from "@/lib/auth/routes";
import { NAV_SECTIONS } from "@/components/shell/nav";

describe("route groups", () => {
  it("protects every sidebar destination and its nested pages", () => {
    for (const { href } of NAV_SECTIONS.flatMap((s) => s.items)) {
      expect(isProtectedPath(href), href).toBe(true);
      expect(isProtectedPath(`${href}/some-id`), `${href}/some-id`).toBe(true);
    }
    expect(isProtectedPath("/onboarding")).toBe(true);
    expect(isProtectedPath("/conversations/abc/review")).toBe(true);
  });

  it("leaves public, API and unknown routes alone", () => {
    for (const path of [
      "/",
      "/login",
      "/signup",
      "/auth/callback",
      "/api/conversations/1/messages",
      "/does-not-exist",
    ]) {
      expect(isProtectedPath(path), path).toBe(false);
    }
  });

  it("matches whole path segments only", () => {
    expect(isProtectedPath("/todayish")).toBe(false);
    expect(isSignedOutOnlyPath("/login-help")).toBe(false);
  });

  it("marks login and signup as signed-out only", () => {
    expect(isSignedOutOnlyPath("/login")).toBe(true);
    expect(isSignedOutOnlyPath("/signup")).toBe(true);
    expect(isSignedOutOnlyPath("/today")).toBe(false);
  });
});
